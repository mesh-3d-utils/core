import { Mesh, MeshAccelerated } from "./mesh.js";
import { BufferGeometry, Matrix4 } from "three";

export interface GeometryMapping {
    indices: Uint32Array
    transforms: Matrix4[]
}

export interface GeometryMap {
    toBase(index: number): GeometryMapping
    fromBase(index: number): GeometryMapping
}

export interface Geometry {
    readonly base: Geometry
    readonly mesh: MeshAccelerated
    
    readonly map: Readonly<{
        vertex: GeometryMap
        face: GeometryMap
    }>
}



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

    constructor(initial: {
            self2base: ArrayGeometryInternalMap
            base2self: ArrayGeometryInternalMap
        } = {
            self2base: ArrayGeometryMap.identity(0).self2base,
            base2self: ArrayGeometryMap.identity(0).base2self,
        }) {
        this.self2base = initial.self2base
        this.base2self = initial.base2self
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
        const transforms = [...indices]
            .map((_, i) => (i + offset0) * 16)
            .map(offset => this.base2self.transforms.subarray(offset, offset + 16))
            .map(transform => new Matrix4().fromArray(transform))
        
        return {
            indices,
            transforms
        }
    }

    toBase(index: number) {
        const offset0 = index === 0 ? 0 : this.self2base.offset1[index - 1]!
        const offset1 = this.self2base.offset1[index]!
        const indices = this.self2base.indices.subarray(offset0, offset1)
        const transforms = [...indices]
            .map((_, i) => (i + offset0) * 16)
            .map(offset => this.self2base.transforms.subarray(offset, offset + 16))
            .map(transform => new Matrix4().fromArray(transform))
        
        return {
            indices,
            transforms
        }
    }
}

interface SymmetricGeometryMapInternal {
    readonly index: Uint32Array
    readonly transform: Float32Array
}

export class SymmetricGeometryMap implements GeometryMap {
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
        const transforms = [...indices]
            .map((_, i) => (i + offset0) * 16)
            .map(offset => this.self2base.transform.subarray(offset, offset + 16))
            .map(transform => new Matrix4().fromArray(transform))
        
        return {
            indices,
            transforms
        }
    }

    fromBase(index: number): GeometryMapping {
        const offset0 = index === 0 ? 0 : this.base2self.index[index - 1]!
        const offset1 = this.base2self.index[index]!
        const indices = this.base2self.index.subarray(offset0, offset1)
        const transforms = [...indices]
            .map((_, i) => (i + offset0) * 16)
            .map(offset => this.base2self.transform.subarray(offset, offset + 16))
            .map(transform => new Matrix4().fromArray(transform))
        
        return {
            indices,
            transforms
        }
    }
}

export interface GeometryFunction extends Geometry {
    update(): void
}

export class IdentityGeometryMap implements GeometryMap {
    toBase(index: number): GeometryMapping {
        return {
            indices: new Uint32Array([index]),
            transforms: [new Matrix4()]
        }
    }

    fromBase(index: number): GeometryMapping {
        return {
            indices: new Uint32Array([index]),
            transforms: [new Matrix4()]
        }
    }
}

export class MeshGeometry implements Geometry {
    get base() {
        return this
    }

    readonly map = {
        vertex: new IdentityGeometryMap(),
        face: new IdentityGeometryMap()
    } as const

    constructor(readonly mesh: MeshAccelerated) { }

    static fromThreeGeometry(geometry: BufferGeometry): MeshGeometry {
        const positions = geometry.getAttribute('position').array
        const indices = geometry.getIndex()!
        const faces: number[][] = []

        for (let i = 0; i < indices.count; i++) {
            faces.push([
                indices.array[i * 3 + 0]!,
                indices.array[i * 3 + 1]!,
                indices.array[i * 3 + 2]!,
            ])
        }

        const positions_n = positions.length / 3
        const positions_x = new Float32Array(positions_n)
        const positions_y = new Float32Array(positions_n)
        const positions_z = new Float32Array(positions_n)
        for (let i = 0; i < positions_n; i++) {
            positions_x[i] = positions[i * 3 + 0]!
            positions_y[i] = positions[i * 3 + 1]!
            positions_z[i] = positions[i * 3 + 2]!
        }

        //TODO: join coplanar faces
        // const face_normals_x = new Array<number>(faces.length)
        // const face_normals_y = new Array<number>(faces.length)
        // const face_normals_z = new Array<number>(faces.length)

        const faces_indicesOffset1 = new Uint32Array(faces.length)
        const faces_indices = new Uint32Array(indices.count)
        for (let i = 0, offset1 = 0, face: number[]; i < faces.length; i++) {
            face = faces[i]!
            faces_indices.set(face, offset1)
            offset1 += face.length
            faces_indicesOffset1[i] = offset1
        }
        
        const mesh = new Mesh({
            vertices: {
                x: positions_x,
                y: positions_y,
                z: positions_z,
            },
            faces: {
                indicesOffset1: faces_indicesOffset1,
                indices: faces_indices,
            },
            edges: {
                creased: new Set<string>(),
            },
        })

        return new MeshGeometry(mesh)
    }
}
