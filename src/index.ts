/*
 * cfg.ts
 * Created on Wed Sep 09 2020
 *
 * Copyright (c) Tree Some. Licensed under the MIT License.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IV_LENGTH, shaHash, randomBytes, getObject, setObject, writeObject, deleteObject } from './utils';
import { cloneDeep } from 'lodash';

enum UpdateType {

	ASCII = 'ascii',
	BASE64 = 'base64',
	HEX = 'hex',
	UCS2 = 'ucs-2',
	UTF16LE = 'utf-16le',
	UTF8 = 'utf-8',
	BINARY = 'binary',

}

export default class CfgLite {
	private cfg: object = {};
	private hash: string = '';
	private iv!: Buffer;
	private time: string = '';

	constructor(private cfgFile: string, private privKey: string = '') {
		this.__check_ext();
		this.cfg = {};

		if ( this.privKey.length > (IV_LENGTH * 2) ) {
			throw Error('The string is too long.');
		}

		if ( fs.existsSync(this.cfgFile) ) {
			let str = '';
			let parse: any = {};
			try {
				str = fs.readFileSync(this.cfgFile, { encoding: UpdateType.HEX });
				parse = this.__parse(str);
			} catch {
				throw Error('Cannot parse cfg file.');
			}

			this.iv = Buffer.from(parse.ivStr, 'hex');
			this.time = parse.time;
			this.hash = parse.hash;

			try {
				const cfgStr = this.__decoding(parse.cfg, UpdateType.HEX);
				this.cfg = JSON.parse(cfgStr);
			} catch {
				throw Error('Fail to decoding cfg contents.');
			}
		} else {
			this.iv = randomBytes();
			this.time = Date.now().toString();
			this.hash = this.time + shaHash(path.basename(this.cfgFile), this.time.length);
			this.save();
		}
	}

	get Filename() {
		return this.cfgFile;
	}

	get Key() {
		return this.privKey;
	}

	private __get_hash() {
		const str = this.privKey + this.hash;
		return str.substring(0, IV_LENGTH * 2);
	}

	private __check_ext() {
		if ( path.extname(this.cfgFile) === '' ) {
			this.cfgFile += '.cfg';
		}
	}

	private __parse(str: string) {
		let idx = 0;

		const ivLenStr = str.slice(0, 4);
		const ivLen = parseInt(ivLenStr, 10);

		idx += ivLenStr.length;

		const ivStr = str.slice(idx, idx + ivLen)

		idx += ivStr.length;

		const timeLenStr = str.slice(idx, idx+4);
		const timeLen = parseInt(timeLenStr, 10);

		idx += timeLenStr.length;

		const time = str.slice(idx, idx+timeLen);
		idx += time.length;

		let cfg = str.slice(idx, idx + str.length);
		cfg = cfg.slice(0, -1); // remove zero
		const hash = time + shaHash(path.basename(this.cfgFile), timeLen);

		return {
			ivStr,
			time,
			hash,
			cfg,
		};
	}

	private __encoding(str: string, type: any = UpdateType.BINARY) {
		const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(this.__get_hash(), 'utf8'), this.iv);
		let result = cipher.update(str, 'utf8', type);
		result += cipher.final(type);
		return result;
	}


	private __decoding(str: string, type: any = UpdateType.BINARY) {
		const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(this.__get_hash(), 'utf8'), this.iv);
		let result = decipher.update(str, type, 'utf8');
		result += decipher.final('utf8');
		return result;
	}

	private rtn(obj: any) {
		return cloneDeep(obj);
	}


	public save(file?: string, removeBefore: boolean = false) {
		const beforeCfgFile = this.cfgFile;
		if ( file ) {
			if ( removeBefore && file === this.cfgFile ) {
				removeBefore = false;
			}
			this.cfgFile = file;
		}
		this.__check_ext();

		const cfgStr = JSON.stringify(this.cfg);
		const cfgEnc = this.__encoding(cfgStr, UpdateType.HEX);
		const ivStr = this.iv.toString('hex');
		fs.writeFileSync(
			this.cfgFile,
			ivStr.length.toString().padStart(4, '0') +
			ivStr +
			this.time.length.toString().padStart(4, '0') +
			this.time.toString() +
			cfgEnc + '0', { encoding: UpdateType.HEX });

		if ( removeBefore ) {
			fs.unlinkSync(beforeCfgFile);
		}
		return;
	}

	public get(key?: string) {
		if ( key ) {
			return this.rtn(getObject(key, this.cfg));
		}
		return this.rtn(this.cfg);
	}

	public set(key: string, value: any) {
		if ( !key ) {
			if ( key === '' && typeof value === 'object' ) {
				this.cfg = value;
				return;
			}
			throw Error('key is not valid');
		}
		const sk = key.split('.');
		setObject(sk, value, this.cfg);
	}

	public merge(key: string, value: any) {
		if ( !key ) {
			throw Error('key is not valid');
		}
		const sk = key.split('.');
		writeObject(sk, value, this.cfg);
	}

	public delete(key: string) {
		if ( !key ) {
			throw Error('key is not valid');
		}
		return deleteObject(key, this.cfg);
	}

	public deleteAll() {
		this.cfg = {};
		return true;
	}

}

