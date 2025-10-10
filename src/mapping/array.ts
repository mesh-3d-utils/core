import { Matrix4 } from "three"
import { GeometryMap, GeometryMapLengths, GeometryMapping } from "../geometry.js"

export interface ArrayGeometryInternalMap {
    /**
     * used for variable-sized arrays in one continuous buffer
     * 
     * offset1[0] is index after last index of key 0
     * offset1[1] is index after last index of key 1
     * etc.
     * 
     * values for key 0 start at indices[0]
     * values for key 1 start at indices[offset1[0]]
     * etc.
     */
    offset1: Uint32Array

    /** indices mapped to, variable-sized arrays per key packed into one buffer */
    indices: Uint32Array

    /**
     * transforms (mat4), one per value
     * 
     * length = indices.length * 16
     */
    transforms: Float32Array
}

export class ArrayGeometryMap implements GeometryMap {
    self2base: ArrayGeometryInternalMap
    base2self: ArrayGeometryInternalMap

    readonly lengths: Readonly<GeometryMapLengths>

    constructor(initial: {
            self2base: ArrayGeometryInternalMap
            base2self: ArrayGeometryInternalMap
        } = {
            self2base: ArrayGeometryMap.identity(0).self2base,
            base2self: ArrayGeometryMap.identity(0).base2self,
        }) {
        this.self2base = initial.self2base
        this.base2self = initial.base2self

        this.lengths = {
            base: initial.base2self.offset1.length,
            self: initial.self2base.offset1.length,
        }
    }

    static map(...mappings: {
            index: number
            transform: Matrix4
        }[][]): ArrayGeometryInternalMap {
        const offset1 = new Uint32Array(mappings.length)
        for (let i = 0, offset = 0; i < mappings.length; i++) {
            offset += mappings[i]!.length
            offset1[i] = offset
        }

        const indices = new Uint32Array(offset1.at(-1) ?? 0)
        const transforms = new Float32Array(indices.length * 16)
        for (let i = 0, offset = 0; i < mappings.length; i++) {
            const values = mappings[i]!
            for (let j = 0; j < values.length; j++) {
                indices[offset] = values[j]!.index
                transforms.set(values[j]!.transform.toArray(), offset * 16)
                offset++
            }
        }

        return {
            offset1,
            indices,
            transforms
        }
    }

    static identity(n: number): ArrayGeometryMap {
        const self2self: ArrayGeometryInternalMap = {
            indices: new Uint32Array(n),
            offset1: new Uint32Array(n + 1),
            transforms: new Float32Array(n * 16),
        }

        const mat4 = new Matrix4().identity().toArray()
        for (let i = 0; i < n; i++) {
            self2self.indices[i] = i
            self2self.offset1[i] = i + 1
            self2self.transforms.set(mat4, i * 16)
        }

        return new ArrayGeometryMap({
            self2base: self2self,
            base2self: self2self,
        })
    }

    fromBase(index: number) {
        const offset0 = index === 0 ? 0 : this.base2self.offset1[index - 1]!
        const offset1 = this.base2self.offset1[index]!
        const indices = this.base2self.indices.subarray(offset0, offset1)
        const transforms = new Float32Array(indices.length * 16)
        for (let i = 0, transforms_offset = 0;
            i !== indices.length;
            i++, transforms_offset += 16)
            transforms.set(this.base2self.transforms.subarray(transforms_offset, transforms_offset + 16), transforms_offset)
        
        return {
            indices,
            transforms
        }
    }

    toBase(index: number) {
        const offset0 = index === 0 ? 0 : this.self2base.offset1[index - 1]!
        const offset1 = this.self2base.offset1[index]!
        const indices = this.self2base.indices.subarray(offset0, offset1)
        const transforms = new Float32Array(indices.length * 16)
        for (let i = 0, transforms_offset = 0;
            i !== indices.length;
            i++, transforms_offset += 16)
            transforms.set(this.self2base.transforms.subarray(transforms_offset, transforms_offset + 16), transforms_offset)
        
        return {
            indices,
            transforms
        }
    }

    static compile(ab: GeometryMap, bc: GeometryMap): ArrayGeometryMap {
        if (ab.lengths.self !== bc.lengths.base)
            throw new Error("lengths do not match")

        // Helper function that works for both directions
        function compileDirection(isForward: boolean): ArrayGeometryInternalMap {
            const m01 = isForward ? ab.fromBase.bind(ab) : bc.toBase.bind(bc)
            const m12 = isForward ? bc.fromBase.bind(bc) : ab.toBase.bind(ab)
            const n_base = isForward ? ab.lengths.base : bc.lengths.self
            const n_self = isForward ? bc.lengths.self : ab.lengths.base

            const offset1 = new Uint32Array(n_base)
            const indices = new Uint32Array(n_self)
            const transforms = new Float32Array(n_self * 16)

            let i_base: number
            let i_1: number
            let i_1_16: number
            let n_1: number
            let i_2: number
            let i_2_16: number
            let n_2: number
            let i_self: number
            let i_self16: number
            const t1 = new Matrix4()
            const t2 = new Matrix4()

            let i1: number
            let m1: GeometryMapping
            let m2: GeometryMapping

            for (i_base = 0, i_1 = 0, n_1 = 0, i_self = 0, i_self16 = 0;
                i_base !== n_base;
                offset1[i_base++] = i_self) {
                m1 = m01(i_base)
                
                for (i_1 = 0, n_1 = m1.indices.length, i_1_16 = 0;
                    i_1 !== n_1;
                    i_1++, i_1_16 += 16) {
                    i1 = m1.indices[i_1]!
                    t1.fromArray(m1.transforms.subarray(i_1_16, i_1_16 + 16))
                    m2 = m12(i1)

                    for (i_2 = 0, i_2_16 = 0, n_2 = m2.indices.length;
                        i_2 !== n_2;
                        i_2++, i_2_16 += 16, i_self++, i_self16 += 16) {
                        indices[i_self] = m2.indices[i_2]!
                        t2.fromArray(m2.transforms.subarray(i_2_16, i_2_16 + 16))
                        t2.premultiply(t1)
                        t2.toArray(transforms.subarray(i_self16, i_self16 + 16))
                    }
                }
            }

            return {
                indices,
                offset1,
                transforms
            }
        }

        // Forward mapping: A -> C via B
        const base2self = compileDirection(true)

        // Backward mapping: C -> A via B
        const self2base = compileDirection(false)

        return new ArrayGeometryMap({ base2self, self2base })
    }
}
