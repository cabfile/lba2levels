require('hostname-patcher'); // when the window is seventh
console.log("Initializing...");

const fs = require('fs/promises');
const fastify = require('fastify')({bodyLimit: 12 * 1024 * 1024});
const rateLimit = require('@fastify/rate-limit');
const errors = require("./errors.json");

const silly = ['Did you need something?', 'Hi!', 'What\'s up?', '???', 'Now what?', 'you have been cursed by the scary text if you dont go shower immediately you will die in 2 seconds'];
const pathPrefix = "/server";
const port = 3000;

const users = require("./users.json"); console.log("Loaded " + Object.keys(users).length + " users");
const recent = require("./recent.json"); console.log("Loaded " + recent.length + " recent levels");
const searchIndex = require("./searchIndex.json"); console.log("Loaded " + Object.keys(searchIndex).length + " search words");
const activeTokens = {}; // {"afbkafbafbps": {id: "afhafjagj", expire: unixTimestamp}}
const tokenManager = setInterval(()=>{
	const tokens = Object.keys(activeTokens);
	const length = tokens.length;
	for(let i = 0; i < length; i++) if(+new Date() > activeTokens[tokens[i]].expire) delete activeTokens[tokens[i]];
}, 1000);
let motd = "";
const motdManager = setInterval(updateMotd, 60000);
let lastLanguage = "en";

fastify.addHook('onRequest', (request, reply, done) => {
	reply.header('Access-Control-Allow-Origin', '*');
	reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Error-Language');

	if (request.method === 'OPTIONS') return reply.code(204).send();
	setLanguage(request.headers["error-language"]);
	done();
});

fastify.get(pathPrefix + '/', (request, reply) => {
	reply.send(silly[Math.floor(Math.random() * silly.length)]);
});

fastify.get(pathPrefix + '/misc/motd', async (request, reply) => {
	reply.send(motd);
});

fastify.setNotFoundHandler((request, reply) => {
	reply.code(404).send("Wrong!");
});

async function main() {
	await fastify.register(rateLimit, {
		global: true,
		max: 2,
		timeWindow: 500,
		continueExceeding: true,
		addHeadersOnExceeding: true,
		errorResponseBuilder: () => getError("rateLimit")
	});
	require("./server.users.js")(fastify, pathPrefix, users, activeTokens, missingParam, missingAuth, getError, recent, searchIndex);
	require("./server.levels.js")(fastify, pathPrefix, users, activeTokens, missingParam, missingAuth, getError, recent, searchIndex);
	require("./server.mod.js")(fastify, pathPrefix, users, activeTokens, missingParam, missingAuth, getError, recent, searchIndex);
	await updateMotd();
	try {
		await fastify.listen({ host: "0.0.0.0", port });
	} catch(e) {
		console.error("Failed to start server:", e);
		return process.exit(1);
	}
	console.log("Server is listening on port " + port);
}
main();

async function updateMotd() {
	try {
		motd = await fs.readFile("motd.txt", "utf8");
	} catch {}
}

function missingParam(reply, name) { reply.code(400).send(getError("missingParam", name)); }
function missingAuth(reply, name) { reply.code(400).send(getError("missingAuth")); }
function randomString() { return Math.random().toString(36).substring(2); }
function setLanguage(lang) { language = errors[lang] ? lang : "en"; }
function getError(id, param) {
	let str = errors[language][id];
	if(!str) str = errors.en[id];
	if(param) return str.replaceAll('{0}', param);
	else return str;
}