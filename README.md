# memfind

Read other process memory as buffer.

Windows only.

## Installation

```bash
npm install memfind
```

## Example
```js
const MemoryFinder = require('memfind');
const mf = new MemoryFinder('notepad.exe');

mf.find('Hello World', block => {
	console.log(block.hexAddress, block.get(-5, 10).toString('binary'));
	// return true to stop find
});

// or

let addr;
const bufToFind = Buffer.from('Hello World');
mf.scan(block => {
	// don't put cpu-intensive code inside scan loop, e.g. Buffer.from()
	if (block.match(bufToFind)) {
		console.log(block.hexAddress, block.get(0, 20).toString());
		if (block.get(20)==0x65) {
			addr = block.address;
			return true;
			// return true to stop scan
		}
	}
});
if (addr) console.log(mf.read(addr-10, 128));
```
