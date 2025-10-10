import { IdentityGeometryMap } from "./mapping/identity.js";
import { Mesh, MeshAccelerated } from "./mesh.js";
import { BufferGeometry } from "three";

export interface GeometryMapping {
    indices: Uint32Array
    /** length = 16 * indices.length */
    transforms: Float32Array
}

export interface GeometryMapLengths {
    /** number of mappings */
    base: number

    /** number of indices summed from all mappings */
    self: number
}

export interface GeometryMap {
    readonly lengths: Readonly<GeometryMapLengths>
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

export interface GeometryFunction extends Geometry {
    update(): void
}

export class MeshGeometry implements Geometry {
    get base() {
        return this
    }

    readonly map: Readonly<{
        vertex: IdentityGeometryMap
        face: IdentityGeometryMap
    }>

    constructor(readonly mesh: MeshAccelerated) { 
        this.map = {
            vertex: new IdentityGeometryMap(this.mesh.vertices.x.length),
            face: new IdentityGeometryMap(this.mesh.faces.indicesOffset1.length)
        }
    }

    static fromThreeGeometry(geometry: BufferGeometry): MeshGeometry {
        const positions = geometry.getAttribute('position').array
        const indices = geometry.getIndex()!
        const faces: number[][] = []

        if (indices.count % 3 !== 0)
            throw new Error('indices.count must be a multiple of 3')

        for (let offset = 0; offset < indices.count; ) {
            faces.push([
                indices.array[offset++]!,
                indices.array[offset++]!,
                indices.array[offset++]!,
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
