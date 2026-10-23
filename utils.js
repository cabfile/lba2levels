const fs = require('fs/promises');
const chains = new Map();

module.exports = {};
module.exports.randomString = function() { return Math.random().toString(36).substring(2); };
module.exports.access = async function(path, mode) {
	try {
		await fs.access(path, mode);
		return true;
	} catch { return false; }
};
module.exports.serialize = function(key, task) {
	const prev = chains.get(key) ?? Promise.resolve();
	const run	= prev.then(task, task);
	const tail = run.catch(() => {});
	chains.set(key, tail);
	tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
	return run;
}
module.exports.atomicWrite = async function(file, data) {
	const tmp = file + '.tmp';
	await fs.writeFile(tmp, data);
	await fs.rename(tmp, file);
}