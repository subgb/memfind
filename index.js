const {K, DTypes: W, BufferTypeFactory} = require('win32-api');
const ref = require('ref-napi');
const Struct = require('ref-struct-di')(ref);

const TH32CS_SNAPPROCESS = 0x00000002;
const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_OPERATION = 0x0008;
const PROCESS_VM_READ = 0x0010;
const PROCESS_VM_WRITE = 0x0020;
const MEM_COMMIT = 0x00001000;
const MEM_IMAGE = 0x1000000;
const MEM_MAPPED = 0x40000;
const MEM_PRIVATE = 0x20000;

const PROCESSENTRY32 = {
	dwSize: W.DWORD,
	cntUsage: W.DWORD,
	th32ProcessID: W.DWORD,
	th32DefaultHeapID: W.ULONG_PTR,
	th32ModuleID: W.DWORD,
	cntThreads: W.DWORD,
	th32ParentProcessID: W.DWORD,
	pcPriClassBase: W.LONG,
	dwFlags: W.DWORD,
	szExeFile: BufferTypeFactory(260),
};

const MEMORY_BASIC_INFORMATION = {
	BaseAddress: W.ULONG_PTR,
	AllocationBase: W.ULONG_PTR,
	AllocationProtect: W.DWORD,
	PartitionId: W.WORD,
	RegionSize: W.SIZE_T,
	State: W.DWORD,
	Protect: W.DWORD,
	Type: W.DWORD,
};


class Block {
	constructor(buffer, info) {
		this.baseBuffer = buffer;
		this.offset = 0;
		this.baseAddress = info.BaseAddress;
		this.baseSize = info.RegionSize; 
		switch (info.Type) {
			case MEM_IMAGE: this.type='image'; break;
			case MEM_MAPPED: this.type='mapped'; break;
			case MEM_PRIVATE: this.type='private'; break;
			default: this.type = '0x'+info.Type.toString(16);
		}
	}

	get address() {
		return this.baseAddress + this.offset;
	}

	get hexAddress() {
		return this.address.toString(16);
	}

	get size() {
		return this.baseSize - this.offset;
	}

	get buffer() {
		return this.offset? this.baseBuffer.slice(this.offset): this.baseBuffer;
	}

	get(index=0, len=0) {
		index += this.offset;
		if (len) return this.baseBuffer.slice(index, index+len);
		return this.baseBuffer[index];
	}

	printable(index=0) {
		const code = this.baseBuffer[this.offset+index]||0;
		if (code<=0x1f) return false;
		if (code>=0x7f && code<=0x9f) return false;
		return true;
	}

	scan(iteratee) {
		const len = this.baseSize;
		for (let i=0; i<len; i++) {
			this.offset = i;
			if (true===iteratee(this)) return true;
		}
	}

	match(buf, index=0) {
		for (let i=0, j=this.offset+index; i<buf.length; i++, j++) {
			if (buf[i]!==this.baseBuffer[j]) return false;
		}
		return true;
	}
}


class MemoryFinder {
	constructor(nameOrPid) {
		const type = typeof nameOrPid;
		if (type=='string') {
			this.pid = MemoryFinder.pidFromProcessName(nameOrPid);
			if (!this.pid) throw new Error('cannot find process by name: '+nameOrPid);
		}
		else if (type=='number') {
			this.pid = nameOrPid;
		}
		else throw new Error('needs process name or pid to init');
		this.handle = knl32.OpenProcess(PROCESS_VM_READ|PROCESS_QUERY_INFORMATION, false, this.pid);
		if (!this.handle) throw new Error('cannot open process '+this.pid);
	}

	static pidFromProcessName(name) {
		name = name.toLowerCase();
		const size = name.length;
		const snapshot = knl32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
		const entry = new Struct(PROCESSENTRY32)();
		entry.dwSize = entry.ref().length;
		if (knl32.Process32First(snapshot, entry.ref())) {
			do {
				const str=entry.szExeFile.slice(0, size).toString('binary');
				if (str.toLowerCase()===name) return entry.th32ProcessID;
			} while (knl32.Process32Next(snapshot, entry.ref()));
		}
	}

	read(address, size=1024) {
		const buf = Buffer.alloc(size);
		const bytesRead = ref.alloc(ref.types.uint64);
		const res = knl32.ReadProcessMemory(this.handle, address, buf, buf.length, bytesRead.address());
		const count = bytesRead.deref();
		return (count<size)? buf.slice(0, count): buf;
	}

	*traverse() {
		const info = new Struct(MEMORY_BASIC_INFORMATION)();
		const size = info.ref().length;
		let address = 0;
		while (knl32.VirtualQueryEx(this.handle, address, info.ref(), size)==size) {
			address += info.RegionSize;
			if (info.State!=MEM_COMMIT) continue;
			if (info.Type==MEM_IMAGE) continue;
			const buffer = this.read(info.BaseAddress, info.RegionSize);
			if (buffer.length) yield new Block(buffer, info);
		}
	}

	scan(iteratee) {
		for (const block of this.traverse()) {
			if (true===block.scan(iteratee)) return;
		}
	}

	find(pattern, cbFound) {
		if (typeof pattern=='string') pattern=Buffer.from(pattern);
		if (!Buffer.isBuffer(pattern)) throw new Error('first arg must be a string or buffer');
		this.scan(block => {
			if (block.match(pattern)) {
				if (true===cbFound(block)) return true;
			}
		});
	}

	totalSize() {
		let total = 0;
		for (const {baseSize} of this.traverse()) {
			total += baseSize;
		}
		return total;
	}
}


Object.assign(K.apiDef, {
	ReadProcessMemory: [W.BOOL, [W.HANDLE, W.ULONG_PTR, W.LPVOID, W.SIZE_T, W.PSIZE_T]],
	CreateToolhelp32Snapshot: [W.HANDLE, [W.DWORD, W.DWORD]],
	Process32First: [W.BOOL, [W.HANDLE, W.POINT]],
	Process32Next : [W.BOOL, [W.HANDLE, W.POINT]],
	VirtualQueryEx: [W.SIZE_T, [W.HANDLE, W.ULONG_PTR, W.POINT, W.SIZE_T]],
});
const knl32 = K.load();
module.exports = MemoryFinder;
