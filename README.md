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

let addr;
const bufToFind = Buffer.from('Hello World');
mf.find(block => {
	if (block.equals(bufToFind)) {
		addr = block.address;
		console.log(block.hexAddress, block.get(0, 20).toString());
		// return true to stop find
	}
});
if (addr) console.log(mf.read(addr-10, 128));
```
