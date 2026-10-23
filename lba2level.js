var lzs = require('lz-string');

class LBA2Level {
	constructor(string) {
		if(string) {
			let decompressed = lzs.decompressFromBase64(string);
			if(decompressed === undefined) throw new Error('Invalid level');
			this.level = JSON.parse(decompressed);
		}
		else this.level = {
			entranceX: 96,
			entranceY: 1184,
			paused: false,
			props: {
				waterheight: 0,
				gravity: 100,
				theme: 0,
				// booleans are REQUIRED to be specified using numbers
				grabbing: 0,
				danec: 0,
				walljump: 1,
				djump: 1,
				startas: 1
			},
			spritedata: '',
			logic: []
		};
	}
	add(...data) {
		if(!data) return;
		var str = '';
		if(this.level.spritedata !== '') str += '|';
		str += data.join(',');
		this.level.spritedata += str;
	}
	remove(i) {
		var objs = this.level.spritedata.split('|');
		objs.splice(i,1);
		this.level.spritedata = objs.join('|');
	}
	toString() {
		return lzs.compressToBase64(JSON.stringify(this.level));
	}
}

module.exports = LBA2Level;