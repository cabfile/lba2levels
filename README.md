# lba2levels
This is the official [LittleBigAwoglet 2](https://lba.cabsweb.site/lba2/) level server software. It is not designed to be scalable due to a lack of necessity and the code could definitely be better.

The official avatars were drawn by Arcadius.
## Setup
Install Node.js v18.x (lower versions might work but are untested), then click on Code -> Download ZIP, and extract the archive somewhere... or if you have Git, just run `git clone https://github.com/cabfile/cabbr.git .` in an empty folder. After that, open a terminal (if you haven't) in the same folder as server.js and run `npm i` to install dependencies.

You can customize:
* Avatar selection in `avatars/`
* The Message Of The Day in `motd.txt`
* Silly messages (`silly`), the path prefix (`pathPrefix`) and port (`port`) in `server.js`.
* The limit of levels one player can have (`levelLimit`) and the default level icon (`defaultLevelIcon`) in `server.levels.js`
* Invalid symbols (`invalidSymbols`) and passwords (`invalidPasswords`) in `server.users.js`

To start the server, run `node server.js`.
