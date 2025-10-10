import { Matrix4 } from "three"
import { GeometryMap, GeometryMapLengths, GeometryMapping } from "../geometry.js"


interface SymmetricGeometryMapInternal {
    readonly index: Uint32Array
    readonly transform: Float32Array
}

export class SymmetricGeometryMap implements GeometryMap {
    get lengths(): Readonly<GeometryMapLengths> {
        return {
            base: this.#self2base.index.length,
            self: this.#self2base.index.length
        }
    }

    #self2base!: SymmetricGeometryMapInternal
    #base2self!: SymmetricGeometryMapInternal

    get self2base() {
        return this.#self2base
    }

    set self2base(self2base) {
        this.#self2base = self2base

        const base2self1: SymmetricGeometryMapInternal = {
            index: new Uint32Array(self2base.index.length),
            transform: new Float32Array(self2base.transform.length)
        }

        const mat = new Matrix4()
        for (let i_self = 0, i_base: number; i_self < self2base.index.length; i_self++) {
            i_base = self2base.index[i_self]!
            base2self1.index[i_base] = i_self
            mat.fromArray(self2base.transform.subarray(i_self * 16, (i_self + 1) * 16))
            mat.invert()
            base2self1.transform.set(mat.toArray(), i_base * 16)
        }

        this.#base2self = base2self1
    }

    get base2self() {
        return this.#base2self
    }

    set base2self(base2self) {
        this.#base2self = base2self

        const self2base1: SymmetricGeometryMapInternal = {
            index: new Uint32Array(base2self.index.length),
            transform: new Float32Array(base2self.transform.length)
        }

        const mat = new Matrix4()
        for (let i_base = 0, i_self: number; i_base < base2self.index.length; i_base++) {
            i_self = base2self.index[i_base]!
            self2base1.index[i_self] = i_base
            mat.fromArray(base2self.transform.subarray(i_base * 16, (i_base + 1) * 16))
            mat.invert()
            self2base1.transform.set(mat.toArray(), i_self * 16)
        }

        this.#self2base = self2base1
    }

    constructor(initial:
            | { self2base: SymmetricGeometryMapInternal }
            | { base2self: SymmetricGeometryMapInternal }
        ) {
        if ('self2base' in initial) {
            this.self2base = initial.self2base
        } else {
            this.base2self = initial.base2self
        }
    }

    toBase(index: number): GeometryMapping {
        const offset0 = index === 0 ? 0 : this.self2base.index[index - 1]!
        const offset1 = this.self2base.index[index]!
        const indices = this.self2base.index.subarray(offset0, offset1)
        const transforms = new Float32Array(indices.length * 16)
        for(let i = 0, offset: number; i < indices.length; i++) {
            offset = indices[i]!
            transforms.set(this.self2base.transform.subarray(offset * 16, (offset + 1) * 16), i * 16)
        }
        
        return {
            indices,
            transforms
        }
    }

    fromBase(index: number): GeometryMapping {
        const offset0 = index === 0 ? 0 : this.base2self.index[index - 1]!
        const offset1 = this.base2self.index[index]!
        const indices = this.base2self.index.subarray(offset0, offset1)
        const transforms = new Float32Array(indices.length * 16)
        for(let i = 0, offset: number; i < indices.length; i++) {
            offset = indices[i]!
            transforms.set(this.base2self.transform.subarray(offset * 16, (offset + 1) * 16), i * 16)
        }
        
        return {
            indices,
            transforms
        }
    }
}
