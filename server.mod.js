const fs = require('fs/promises');
const { randomString, access } = require('./utils.js');

module.exports = function(fastify, pathPrefix, users, activeTokens, missingParam, missingAuth, getError, recent, searchIndex) {
	
	fastify.post(pathPrefix + '/mod/levels/delete', async (request, reply) => {
		const {user, id} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!user) return missingParam(reply, "user");
		if(!id) return missingParam(reply, "id");
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		const userID = activeTokens[token].id;
		if(users[userID].rank < 1) return reply.code(403).send("Insufficient permissions");
		
		// step 3: check level's existence
		const basePath = ("./levels/" + user + "/" + sanitize(id));
		if(!await access(basePath + ".json")) return reply.code(404).send(getError("levelNotFound"));
		
		// step 4: quickly snatch name if we can
		let name = "[failed to read metadata]";
		try { name = JSON.parse(await fs.readFile(basePath + ".json", "utf8")).name; } catch {}
		
		// step 5: delete it
		await fs.rm(basePath + ".json");
		try { await fs.rm(basePath + ".awg"); } catch {}
		
		// step 6: remove from search
		const words = Object.keys(searchIndex);
		const length = words.length;
		let change = false;
		for(let i = 0; i < length; i++) {
			for(let o = searchIndex[words[i]].length - 1; o >= 0; o--) {
				if(searchIndex[words[i]][o][0] == user && searchIndex[words[i]][o][1] == id) {
					searchIndex[words[i]].splice(o, 1);
					change = true;
				}
			}
		}
		if(change) await fs.writeFile("./searchIndex.json", JSON.stringify(searchIndex));
		
		// step 7: remove from recent
		const length2 = recent.length;
		change = false;
		for(let i = length2 - 1; i >= 0; i--) {
			if(recent[i][0] == user && recent[i][1] == id) {
				recent.splice(i, 1);
				change = true;
				break;
			}
		}
		if(change) await fs.writeFile("./recent.json", JSON.stringify(recent));
		
		console.log("[Moderation] " + users[userID].name + " has deleted " + name + " by " + users[user].name);
		reply.send("OK");
	});
	
	fastify.post(pathPrefix + '/mod/users/ban', async (request, reply) => {
		const {id} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!id) return missingParam(reply, "id");
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		const userID = activeTokens[token].id;
		if(users[userID].rank < 2) return reply.code(403).send("Insufficient permissions");
		
		// step 3: check user's existence
		if(!users[id]) return reply.code(403).send(getError("userNotFound"));
		
		// step 4: gtfo
		users[id].rank = -2;
		killToken(activeTokens, id);
		await fs.writeFile("./users.json", JSON.stringify(users));
		
		// step 5: get rid of all of the user's levels if they have any
		await fs.rm("./levels/" + id, {force: true, recursive: true});
		
		// step 6: remove from search
		const words = Object.keys(searchIndex);
		const length = words.length;
		let change = false;
		for(let i = 0; i < length; i++) {
			for(let o = searchIndex[words[i]].length - 1; o >= 0; o--) {
				if(searchIndex[words[i]][o][0] == id) {
					searchIndex[words[i]].splice(o, 1);
					change = true;
				}
			}
		}
		if(change) await fs.writeFile("./searchIndex.json", JSON.stringify(searchIndex));
		
		// step 7: remove from recent
		const length2 = recent.length;
		change = false;
		for(let i = length2 - 1; i >= 0; i--) {
			if(recent[i][0] == id) {
				recent.splice(i, 1);
				change = true;
			}
		}
		if(change) await fs.writeFile("./recent.json", JSON.stringify(recent));
		
		console.log("[Moderation] " + users[userID].name + " has banned " + users[id].name);
		reply.send("OK");
	});
};

function killToken(activeTokens, id) {
	const keys = Object.keys(activeTokens);
	const length = keys.length;
	for(let i = 0; i < length; i++) {
		if(activeTokens[keys[i]].id === id) {
			delete activeTokens[keys[i]];
			return;
		}
	}
}
function sanitize(s) { return s.replaceAll("/","").replaceAll("\\",""); }