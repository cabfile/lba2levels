const fs = require('fs/promises');
const imageSize = require('image-size');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { randomString, access } = require('./utils.js');

const invalidSymbols = ['\\','/',':','*','?','"','>','<','|',' ','@'];
const invalidPasswords = ['123456','098123','password','Password','PASSWORD'];
const invalidUsernameRegex = /[^\x20-\x7F]/;

const avatars = [];
const usersLowercase = [];
const usersNamesToIDs = {};

/*
	RANKS
	-2 = banned
	-1 = bot
	0 = regular user
	1 = moderator
	2 = administrator
*/

module.exports = function(fastify, pathPrefix, users, activeTokens, missingParam, missingAuth, getError, recent, searchIndex) {
	const keys = Object.keys(users);
	const length = keys.length;
	for(let i = 0; i < length; i++) {
		usersLowercase.push(users[keys[i]].name.toLowerCase());
		usersNamesToIDs[users[keys[i]].name] = keys[i];
	}
	fs.readdir("./avatars").then(async a=>{
		const length = a.length;
		for(let i = 0; i < length; i++) {
			if(!a[i].endsWith(".png")) continue;
			avatars.push(await fs.readFile("./avatars/" + a[i]));
		}
		console.log("Loaded " + avatars.length + " avatars");
	});
	imageSize.disableTypes(imageSize.types.filter(e=>e!=="png"));
	
	fastify.post(pathPrefix + '/users/fetch', async (request, reply) => {
		const {id} = request.body;
		
		// step 1: check data
		if(!id) return missingParam(reply, "id");
		if(!users[id]) return reply.code(404).send(getError("userNotFound"));
		
		// step 2: retrieve data
		const user = users[id];
		const levels = [];
		if(await access("./levels/" + id)) {
			const userLevels = (await fs.readdir("./levels/" + id)).filter(e=>e.endsWith(".json"));
			for(let o = 0; o < userLevels.length; o++) {
				const file = userLevels[o];
				const level = JSON.parse(await fs.readFile("./levels/" + id + "/" + file, "utf8"));
				levels.push({id: file.substring(0, file.length - 5), name: level.name, icon: level.icon, description: level.description, labels: level.labels, size: level.size, plays: level.plays, hearts: level.hearts, date: level.date});
			}
		}
		
		reply.send({
			id,
			name: user.name,
			avatar: user.avatar,
			description: user.description,
			followers: user.followers,
			hearted: user.hearted,
			following: user.following,
			levels,
			rank: user.rank,
			contestsWon: user.contestsWon
		});
	});

	fastify.post(pathPrefix + '/users/fetch-name', async (request, reply) => {
		const {name} = request.body;
		
		// step 1: check data
		if(!name) return missingParam(reply, "name");
		let id;
		const keys = Object.keys(users);
		const len = keys.length;
		for(let i = 0; i < len; i++) {
			if(users[keys[i]].name === name) {
				id = keys[i];
				break;
			}
		}
		if(!id) return reply.code(404).send(getError("userNotFound"));
		
		// step 2: retrieve data
		const user = users[id];
		const levels = [];
		if(await access("./levels/" + id)) {
			const userLevels = (await fs.readdir("./levels/" + id)).filter(e=>e.endsWith(".json"));
			for(let o = 0; o < userLevels.length; o++) {
				const file = userLevels[o];
				const level = JSON.parse(await fs.readFile("./levels/" + id + "/" + file, "utf8"));
				levels.push({id: file.substring(0, file.length - 5), name: level.name, icon: level.icon, description: level.description, labels: level.labels, size: level.size, plays: level.plays, hearts: level.hearts, date: level.date});
			}
		}
		
		// step 3: sort levels by name
		levels.sort((a, b) => a.name.charCodeAt() - b.name.charCodeAt());
		
		reply.send({
			id,
			name: user.name,
			avatar: user.avatar,
			description: user.description,
			followers: user.followers,
			hearted: user.hearted,
			following: user.following,
			levels,
			rank: user.rank,
			contestsWon: user.contestsWon
		});
	});

	fastify.post(pathPrefix + '/users/fetch-self', async (request, reply) => {
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		
		// step 3: retrieve data
		const id = activeTokens[token].id;
		const user = users[id];
		const levels = [];
		if(await access("./levels/" + id)) {
			const userLevels = (await fs.readdir("./levels/" + id)).filter(e=>e.endsWith(".json"));
			for(let o = 0; o < userLevels.length; o++) {
				const file = userLevels[o];
				const level = JSON.parse(await fs.readFile("./levels/" + id + "/" + file, "utf8"));
				levels.push({id: file.substring(0, file.length - 5), name: level.name, icon: level.icon, description: level.description, labels: level.labels, size: level.size, plays: level.plays, hearts: level.hearts, date: level.date});
			}
		}
		
		reply.send({
			id,
			name: user.name,
			avatar: user.avatar,
			description: user.description,
			followers: user.followers,
			hearted: user.hearted,
			following: user.following,
			levels,
			rank: user.rank,
			contestsWon: user.contestsWon
		});
	});

	fastify.post(pathPrefix + '/users/follow', async (request, reply) => {
		const {id, action} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!id) return missingParam(reply, "id");
		if(!action) return missingParam(reply, "action");
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		if(!users[id]) return reply.code(404).send(getError("userNotFound"));
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		const userID = activeTokens[token].id;
		
		// step 3: update user
		const user = users[id];
		const index = user.followers.indexOf(userID);
		const index2 = users[userID].following.indexOf(id);
		if(action) {
			if(index !== -1) return reply.code(400).send(getError("userAlreadyFollowed"));
			if(index2 === -1) users[userID].following.push(id);
			user.followers.push(userID);
		} else {
			if(index === -1) return reply.code(400).send(getError("userNotFollowed"));
			if(index2 !== -1) users[userID].following.splice(index2, 1);
			user.followers.splice(index, 1);
		}
		await fs.writeFile("./users.json", JSON.stringify(users));
		
		reply.send("OK");
	});

	fastify.post(pathPrefix + '/users/register', async (request, reply) => {
		let {name, pass} = request.body;
		
		// step 1: check data
		if(!name) return missingParam(reply, "name");
		name = name.toString();
		if(!pass) return missingParam(reply, "pass");
		pass = pass.toString();
		
		// step 2: check username
		if(usersLowercase.indexOf(name.toLowerCase()) !== -1) return reply.code(400).send(getError("registerSimilarName")); // more people should do case-insensitive checks
		if(name.length < 3) return reply.code(400).send(getError("registerNameTooShort"));
		if(name.length >= 16) return reply.code(400).send(getError("registerNameTooLong"));
		if(invalidSymbols.some(e => name.indexOf(e) !== -1)) return reply.code(400).send(getError("registerNameForbidden"));
		if(invalidUsernameRegex.test(name)) return reply.code(400).send(getError("registerNameForbidden2"));
		
		// step 3: check password
		if(pass.length < 6) return reply.code(400).send(getError("registerPassTooShort"));
		if(pass === name) return reply.code(400).send(getError("registerPassSameAsName"));
		if(invalidPasswords.indexOf(pass) !== -1) return reply.code(400).send(getError("registerPassUnsafe"));
		
		// step 4: register!
		const id = randomString() + randomString();
		users[id] = {
			name,
			avatar: avatars[Math.floor(Math.random() * avatars.length)].toString("base64"),
			description: "",
			followers: [],
			hearted: [],
			following: [],
			rank: 0,
			hash: await bcrypt.hash(pass, 10),
			contestsWon: 0
		};
		usersLowercase.push(name.toLowerCase());
		usersNamesToIDs[name] = id;
		await fs.writeFile("./users.json", JSON.stringify(users));
		
		// step 5: create a token
		reply.send(freeToken(id, activeTokens));
		console.log("[Users] Registered " + name);
	});

	fastify.post(pathPrefix + '/users/login', async (request, reply) => {
		let {name, pass} = request.body;
		
		// step 1: check data
		if(!name) return missingParam(reply, "name");
		name = name.toString();
		if(!pass) return missingParam(reply, "pass");
		pass = pass.toString();
		
		// step 2: check username and password
		const id = userIDFromName(name, users);
		if(!id) return reply.code(400).send(getError("loginInvalid")); // ah yes, the classic cryptic error message
		if(!users[id].hash) return reply.code(403).send(getError("loginDisabled"));
		if(users[id].rank === -2) return reply.code(403).send(getError("loginBanned"));
		if(!await bcrypt.compare(pass, users[id].hash)) return reply.code(400).send(getError("loginInvalid"));
		
		// step 3: create a token
		reply.send(freeToken(id, activeTokens));
		console.log("[Users] " + name + " logged in");
	});

	fastify.post(pathPrefix + '/users/update', async (request, reply) => {
		const {field, value} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!field) return missingParam(reply, "field");
		if(!value) return missingParam(reply, "value");
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		const userID = activeTokens[token].id;
		
		// step 3: update user
		if(field !== "avatar" && field !== "description") return reply.code(400).send(getError("userUpdateUnknownField"));
		if(typeof value !== "string") return reply.code(400).send(getError("userUpdateInvalid"));
		if(field === "description") {
			if(value.length >= 128) return reply.code(400).send(getError("userUpdateDescTooLong"));
			users[userID][field] = value;
		}
		else if(field === "avatar") {
			let icon;
			if(value) {
				const index = value.indexOf("base64,");
				if(index !== -1) icon = value.substring(index + 7); else icon = value;
				let trueIcon;
				try { trueIcon = Buffer.from(icon, "base64"); } catch { return reply.code(400).send(getError("userUpdateInvalid")); }
				if(trueIcon.length > 16384) return reply.code(400).send(getError("userUpdateInvalid"));
				try {
					const size = imageSize.imageSize(trueIcon);
					if(size.width !== 64 || size.height !== 64) throw "";
				} catch { return reply.code(400).send(getError("userUpdateInvalid")); }
				users[userID][field] = icon;
			} else return reply.code(400).send(getError("userUpdateInvalid"));
		}
		await fs.writeFile("./users.json", JSON.stringify(users));
		
		reply.send("OK");
		console.log("[Users] " + users[userID].name + " has updated their " + field);
	});

	fastify.post(pathPrefix + '/users/extend', (request, reply) => {
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.split(" ")[1];
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		
		// step 3: restart the timer
		activeTokens[token].expire = +new Date() + 15 * 60 * 1000;
		
		reply.send("OK");
	});

	fastify.post(pathPrefix + '/users/logout', async (request, reply) => {
		const auth = request.headers.authorization;
		
		// step 1: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		
		// step 2: destroy token
		delete activeTokens[token];
		
		reply.send("OK");
		console.log("[Users] " + name + " has logged out");
	});
};

function userIDFromName(name, users) {
	if(usersNamesToIDs[name]) return usersNamesToIDs[name];
	// if it doesnt return immediately then i did something wrong but its not too big of a deal
	const keys = Object.keys(users);
	const length = keys.length;
	for(let i = 0; i < length; i++) {
		if(users[keys[i]].name === name) {
			usersNamesToIDs[name] = keys[i];
			return keys[i];
		}
	}
}

function freeToken(id, activeTokens) {
	let token = randomUUID();
	while(activeTokens[token]) token = randomUUID(); // prevent the ultra mega rare collisions
	const expire = +new Date() + 15 * 60 * 1000; // expire after 15 minutes
	activeTokens[token] = {id, expire};
	return token;
}