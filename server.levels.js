const fs = require('fs/promises');
const imageSize = require('image-size');
const { randomString, access, serialize, atomicWrite } = require('./utils.js');
const LBA2Level = require('./lba2level.js');

const levelLimit = 25;
const defaultLevelIcon = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURQCU/7/k/4b2XqYAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEfSURBVEjHhZVZFsQgCATbG8j9L5vEhUVp4sdgfDWgpTH4moyWh9laAYj0lYUCb7/zSth9LZWVGN2ZBfq0B9+fMcURbMY6GAErxYHeuuXJAT9jBqicATDTa1kcWKVKQND/NlPAFCugitO1tA94+7abBJBb8QWcihNAgmID1n/gKqHZIJji/QSq+EtCgaUYBSD0kMZQKF6hU8U7gClWgCl2gE6YlBBTg3YvFkxxAkhQnAN6SAvAlxoAf+/aPEOVYhSA5kG5V7+A6G4eJ9cFqngHqtgBzg0FEsVnBpcmnlyEdTnFexDnws0eAawUBZbi8B0iivVjUn7PCmDftAWgu/lzXaO6jf1upqfGCpGrQi+HU/EFnIoTICoOwHVI9ZUSeQA4WmHwc32C7gAAAABJRU5ErkJggg==";

module.exports = function(fastify, pathPrefix, users, activeTokens, missingParam, missingAuth, getError, recent, searchIndex) {
	imageSize.disableTypes(imageSize.types.filter(e=>e!=="png"));
	
	fastify.post(pathPrefix + '/levels/play', async (request, reply) => {
		const {user, id} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!user) return missingParam(reply, "user");
		if(!id) return missingParam(reply, "id");
		
		// step 2: check user and level
		if(!users[user]) return reply.code(404).send(getError("levelNotFound"));
		let count = true;
		if(auth && auth.startsWith("Bearer ")) {
			const token = auth.substring(7);
			if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
			if(users[activeTokens[token].id].rank === -1) count = false;
		}
		const path = "./levels/" + user + "/" + sanitize(id);
		if(!await access(path + ".json")) return reply.code(404).send(getError("levelNotFound"));
		if(!await access(path + ".awg")) return reply.code(404).send(getError("levelCorrupted"));
		
		// step 3: update metadata
		if(count) {
			await serialize("play" + user + ":" + id, async () => {
				const metadata = JSON.parse(await fs.readFile(path + ".json", "utf8"));
				metadata.plays++;
				await atomicWrite(path + ".json", JSON.stringify(metadata));
			});
		}

		reply.send(await fs.readFile(path + ".awg", "base64"));
	});

	fastify.post(pathPrefix + '/levels/play-code', async (request, reply) => {
		const {code} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!code) return missingParam(reply, "code");
		if(typeof code !== "string") return reply.code(400).send(getError("levelCodeInvalid"));
		const split = code.split("-");
		if(split.length !== 2) return reply.code(400).send(getError("levelCodeInvalid"));
		const user = split[0];
		const id = split[1];
		
		// step 2: check user and level
		if(!users[user]) return reply.code(404).send(getError("levelNotFound"));
		let count = true;
		if(auth && auth.startsWith("Bearer ")) {
			const token = auth.substring(7);
			if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
			if(users[activeTokens[token].id].rank === -1) count = false;
		}
		const path = "./levels/" + user + "/" + sanitize(id);
		if(!await access(path + ".json")) return reply.code(404).send(getError("levelNotFound"));
		if(!await access(path + ".awg")) return reply.code(404).send(getError("levelCorrupted"));
		
		// step 3: update metadata
		if(count) {
			await serialize("play" + user + ":" + id, async () => {
				const metadata = JSON.parse(await fs.readFile(path + ".json", "utf8"));
				metadata.plays++;
				await atomicWrite(path + ".json", JSON.stringify(metadata));
			});
		}

		reply.send(await fs.readFile(path + ".awg", "base64"));
	});

	fastify.post(pathPrefix + '/levels/search', async (request, reply) => {
		const {query} = request.body;
		
		// step 1: check data
		if(!query) return missingParam(reply, "query");
		
		// step 2: find relevant entries in the search index
		const words = query.toString().trim().toLowerCase().split(" ");
		const length = words.length;
		const results = [];
		for(let i = 0; i < length; i++) {
			if(!searchIndex[words[i]]) continue;
			const word = searchIndex[words[i]].slice(0, 20);
			if(word) {
				const length2 = word.length;
				for(let i = 0; i < length2; i++) {
					try {
						const user = users[word[i][0]];
						const level = JSON.parse(await fs.readFile("./levels/" + word[i][0] + "/" + word[i][1] + ".json", "utf8"));
						results.push({
							level: {
								id: word[i][1], name: level.name, icon: level.icon, description: level.description, labels: level.labels, size: level.size, plays: level.plays, hearts: level.hearts, date: level.date
							},
							user: {
								id: word[i][0],
								name: user.name,
								avatar: user.avatar,
								description: user.description,
								followers: user.followers,
								hearted: user.hearted,
								following: user.following,
								rank: user.rank,
								contestsWon: user.contestsWon
							}
						});
					} catch {}
				}
			}
		}
		
		// step 3: filter out repeats
		const seen = [];
		const resultsF = results.filter(e=>{
			if(seen.length === 20) return false;
			if(seen.indexOf(e.user.id + e.level.id) === -1) {
				seen.push(e.user.id + e.level.id);
				return true;
			} else return false;
		});

		reply.send(resultsF);
	});

	fastify.post(pathPrefix + '/levels/publish', async (request, reply) => {
		const {name, icon, description, labels, data} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!name) return missingParam(reply, "name");
		if(!data) return missingParam(reply, "data");
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		const userID = activeTokens[token].id;
		
		// step 3: check validness of the level
		const name_ = name.toString();
		if(name_.length > 64) return reply.code(400).send("Level name is too long (maximum 64 characters)");
		
		let icon_;
		if(icon) {
			if(typeof icon !== "string") return reply.code(400).send(getError("levelIconInvalid"));
			const index = icon.indexOf("base64,");
			if(index !== -1) icon_ = icon.substring(index + 7); else icon_ = icon;
			let trueIcon;
			try { trueIcon = Buffer.from(icon_, "base64"); } catch { return reply.code(400).send(getError("levelIconInvalid")); }
			if(trueIcon.length > 16384) return reply.code(400).send(getError("levelIconTooLarge"));
			try {
				const size = imageSize.imageSize(trueIcon);
				if(size.width !== 64 || size.height !== 64) throw "";
			} catch { return reply.code(400).send(getError("levelIconInvalidFormat")); }
		} else icon_ = defaultLevelIcon;
		
		let levelBuffer;
		try {
			levelBuffer = Buffer.from(data, "base64");
		} catch {
			return reply.code(400).send(getError("levelInvalid"));
		}
		if(levelBuffer.length > 10485760) return reply.code(400).send(getError("levelTooLarge"));
		try {
			const lvl = new LBA2Level(data);
			if(lvl.level.entranceX === undefined || lvl.level.entranceX === null || lvl.level.entranceY === undefined || lvl.level.entranceY === null) throw 0;
		} catch {
			return reply.code(400).send(getError("levelInvalid"));
		}
		
		// step 4: check if the user has too many levels
		if(await access("./levels/" + userID)) {
			const userLevels = (await fs.readdir("./levels/" + userID)).filter(e=>e.endsWith(".json"));
			if(userLevels.length >= levelLimit) return reply.code(403).send(getError("levelLimit"));
		}
		
		// step 5: upload the damn level
		const levelID = randomString();
		await serialize("publish" + userID + ":" + levelID, async () => {
			await fs.mkdir("./levels/" + userID, { recursive: true });
			await atomicWrite("./levels/" + userID + "/" + levelID + ".awg", levelBuffer);
			await atomicWrite("./levels/" + userID + "/" + levelID + ".json", JSON.stringify({
				name: name_,
				icon: icon_,
				description: description.toString() ?? "",
				labels: labels ? labels.map(e=>{
					const parsed = parseInt(e);
					return isNaN(parsed) ? 0 : parsed;
				}) : [],
				size: levelBuffer.length,
				plays: 0,
				hearts: [],
				date: Date.now()
			}));
			
			// step 6: add it to the list of recent levels
			if(recent.length >= 100) recent.shift();
			recent.push([userID, levelID]);
			await atomicWrite("./recent.json", JSON.stringify(recent));
			
			// step 7: index it
			const words = name_.trim().toLowerCase().split(" ");
			for(let i = 0; i < words.length; i++) {
				if(!searchIndex[words[i]]) searchIndex[words[i]] = [];
				searchIndex[words[i]].push([userID, levelID]);
			}
			await atomicWrite("./searchIndex.json", JSON.stringify(searchIndex));
		});
		
		console.log("[Levels] " + users[userID].name + " has published " + name_);
		reply.send(userID + "-" + levelID);
	});

	fastify.post(pathPrefix + '/levels/recent', async (request, reply) => {
		const r = [];
		for(let i = recent.length - 1; r.length < 20; i--) {
			const user = users[recent[i][0]];
			const path = "./levels/" + recent[i][0] + "/" + recent[i][1] + ".json";
			if(!await access(path)) continue;
			try {
				const level = JSON.parse(await fs.readFile(path, "utf8"));
				r.push({
					level: {
						id: recent[i][1], name: level.name, icon: level.icon, description: level.description, labels: level.labels, size: level.size, plays: level.plays, hearts: level.hearts, date: level.date
					},
					user: {
						id: recent[i][0],
						name: user.name,
						avatar: user.avatar,
						description: user.description,
						followers: user.followers,
						hearted: user.hearted,
						following: user.following,
						rank: user.rank,
						contestsWon: user.contestsWon
					}
				});
			} catch {}
		}
		reply.send(r);
	});

	fastify.post(pathPrefix + '/levels/heart', async (request, reply) => {
		const {user, id, action} = request.body;
		const auth = request.headers.authorization;
		
		// step 1: check data
		if(!user) return missingParam(reply, "user");
		if(!id) return missingParam(reply, "id");
		if(!action) return missingParam(reply, "action");
		if(!auth) return missingAuth(reply);
		if(!auth.startsWith("Bearer ")) return missingAuth(reply);
		
		// step 2: check auth
		const token = auth.substring(7);
		if(!activeTokens[token]) return reply.code(400).send(getError("tokenInvalid"));
		const userID = activeTokens[token].id;
		
		// step 3: check level
		const path = "./levels/" + user + "/" + sanitize(id) + ".json";
		if(!await access(path)) return reply.code(404).send(getError("levelNotFound"));
		
		// step 4: update metadata
		await serialize("publish" + userID + ":" + levelID, async () => {
			const metadata = JSON.parse(await fs.readFile(path, "utf8"));
			const index = metadata.hearts.indexOf(userID);
			let index2 = -1;
			for(let i = 0; i < users[userID].hearted.length; i++) {
				if(users[userID].hearted[i].user == user && users[userID].hearted[i].id == id) {
					index2 = i;
					break;
				}
			}
			if(action) {
				if(index !== -1) return reply.code(400).send(getError("levelAlreadyHearted"));
				if(index2 === -1) {
					users[userID].hearted.push({user, id});
					await atomicWrite("./users.json", JSON.stringify(users));
				}
				metadata.hearts.push(userID);
			} else {
				if(index === -1) return reply.code(400).send(getError("levelNotHearted"));
				if(index2 !== -1) {
					users[userID].hearted.splice(index2, 1);
					await atomicWrite("./users.json", JSON.stringify(users));
				}
				metadata.hearts.splice(index, 1);
			}
			await atomicWrite(path, JSON.stringify(metadata));
		});
		
		reply.send("OK");
	});

	fastify.post(pathPrefix + '/levels/fetch', async (request, reply) => {
		const {user, id} = request.body;
		
		// step 1: check data
		if(!user) return missingParam(reply, "user");
		if(!id) return missingParam(reply, "id");
		
		// step 2: check user and level
		if(!users[user]) return reply.code(404).send(getError("levelNotFound"));
		const path = "./levels/" + user + "/" + sanitize(id) + ".json";
		if(!await access(path)) return reply.code(404).send(getError("levelNotFound"));
		
		reply.send(JSON.parse(await fs.readFile(path, "utf8")));
	});

	fastify.post(pathPrefix + '/levels/delete', async (request, reply) => {
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
		
		// step 3: check level's existence
		const basePath = ("./levels/" + userID + "/" + sanitize(id));
		if(!await access(basePath + ".json")) return reply.code(404).send(getError("levelNotFound"));
		
		// step 4: quickly snatch name if we can
		let name = "[failed to read metadata]";
		try { name = JSON.parse(await fs.readFile(basePath + ".json", "utf8")).name; } catch {}
		
		// step 5: delete it
		await serialize("delete" + userID + ":" + id, async () => {
			await fs.rm(basePath + ".json");
			try { await fs.rm(basePath + ".awg"); } catch {}
			
			// step 6: remove from search
			const words = Object.keys(searchIndex);
			const length = words.length;
			let change = false;
			for(let i = 0; i < length; i++) {
				for(let o = searchIndex[words[i]].length - 1; o >= 0; o--) {
					if(searchIndex[words[i]][o][0] == userID && searchIndex[words[i]][o][1] == id) {
						searchIndex[words[i]].splice(o, 1);
						change = true;
					}
				}
			}
			if(change) await atomicWrite("./searchIndex.json", JSON.stringify(searchIndex));
			
			// step 7: remove from recent
			const length2 = recent.length;
			change = false;
			for(let i = length2 - 1; i >= 0; i--) {
				if(recent[i][0] == userID && recent[i][1] == id) {
					recent.splice(i, 1);
					change = true;
					break;
				}
			}
			if(change) await atomicWrite("./recent.json", JSON.stringify(recent));
		});
		
		console.log("[Levels] " + users[userID].name + " has deleted " + name);
		reply.send("OK");
	});

	fastify.post(pathPrefix + '/levels/formal-name', async (request, reply) => {
		const {user, id} = request.body;
		
		// step 1: check data
		if(!user) return missingParam(reply, "user");
		if(!id) return missingParam(reply, "id");
		
		// step 2: check user and level
		if(!users[user]) return reply.code(404).send(getError("levelNotFound"));
		const path = "./levels/" + user + "/" + sanitize(id);
		if(!await access(path + ".json")) return reply.code(404).send(getError("levelNotFound"));

		// step 3: assemble
		const metadata = JSON.parse(await fs.readFile(path + ".json", "utf8"));
		
		reply.send(metadata.name + " by " + users[user].name);
	});

	fastify.post(pathPrefix + '/levels/formal-name-code', async (request, reply) => {
		const {code} = request.body;
		
		// step 1: check data
		if(!code) return missingParam(reply, "code");
		if(typeof code !== "string") return reply.code(400).send(getError("levelCodeInvalid"));
		const split = code.split("-");
		if(split.length !== 2) return reply.code(400).send(getError("levelCodeInvalid"));
		const user = split[0];
		const id = split[1];
		
		// step 2: check user and level
		if(!users[user]) return reply.code(404).send(getError("levelNotFound"));
		const path = "./levels/" + user + "/" + sanitize(id);
		if(!await access(path + ".json")) return reply.code(404).send(getError("levelNotFound"));

		// step 3: assemble
		const metadata = JSON.parse(await fs.readFile(path + ".json", "utf8"));
		
		reply.send(metadata.name + " by " + users[user].name);
	});
};

function sanitize(s) { return s.replaceAll("/","").replaceAll("\\",""); }