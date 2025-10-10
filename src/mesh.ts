import { Vector3Tuple } from "three"

export function edgeKey(faceEdge: FaceEdge): string {
    const v0 = faceEdge.face.vertices[faceEdge.edge]!
    const v1 = faceEdge.face.vertices[(faceEdge.edge + 1) % faceEdge.face.edges]!
    
    return edgeKey1(v0, v1)
}

export function edgeKey1(v0: number, v1: number): string {
    return v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`
}

export type Face = Readonly<{
    index: number

    /** = indices.length */
    edges: number

    /** vertex indices for face */
    vertices: Uint32Array

    /** [offset0, offset1] */
    indicesOffset: readonly [offset0: number, offset1: number]
}>

export type FaceEdge = Readonly<{
    /** face index */
    face: Face

    /**
     * edge index within face
     * 
     * vertex indices [index0, index1] determined from edge
     * 
     * indices = [edge, (edge + 1) % face.edges]
     */
    edge: number
}>

export enum EdgeVertexOrder {
    v01 = 0,
    v10 = 1,
}

export type FaceEdgeOriented = Readonly<{
    faceEdge: FaceEdge
    order: EdgeVertexOrder
}>

export type FaceEdgeOrientedKeyed = Readonly<FaceEdgeOriented & {
    key: string
}>

export interface VertexNeighbor {
    face: Face
    edges: [FaceEdgeOrientedKeyed, FaceEdgeOrientedKeyed]
}

export interface MeshInfo {
    readonly vertices: {
        x: ArrayLike<number>
        y: ArrayLike<number>
        z: ArrayLike<number>
    }

    /**
    * Quads, triangles, and n-gons are supported.
    */
    readonly faces: {
        /**
         * index in faces.indices after this face
         * 
         * face 0 implicitly starts at offset 0; indicesOffset1[0] is number of vertices in face 0
         */
        indicesOffset1: ArrayLike<number>

        /**
         * vertex indices for face
         */
        indices: ArrayLike<number>
    }
    
    readonly edges: {
        /** creased edges */
        creased: Set<string>
    }
}

export interface MeshInfoModifiable extends MeshInfo {
    vertices: {
        x: number[]
        y: number[]
        z: number[]
    }
    faces: {
        indicesOffset1: number[]
        indices: number[]
    }
    edges: {
        creased: Set<string>
    }
}

export interface MeshInfoBuffers extends MeshInfo {
    vertices: {
        x: Float32Array
        y: Float32Array
        z: Float32Array
    }
    faces: {
        indicesOffset1: Uint32Array
        indices: Uint32Array
    }
    edges: {
        creased: Set<string>
    }
}

export function isMeshInfoBuffers(info: MeshInfo): info is MeshInfoBuffers {
    return (
        info.vertices.x instanceof Float32Array &&
        info.vertices.y instanceof Float32Array &&
        info.vertices.z instanceof Float32Array &&
        info.faces.indicesOffset1 instanceof Uint32Array &&
        info.faces.indices instanceof Uint32Array
    )
}

export class Mesh<Info extends MeshInfo = MeshInfo> {
    get vertices(): Info["vertices"] {
        return this.info.vertices
    }

    get faces(): Info["faces"] {
        return this.info.faces
    }

    get edges(): Info["edges"] {
        return this.info.edges
    }

    constructor(readonly info: Info) {
    }

    cloneInfo<Modifiable extends boolean = false>({ modifiable = <Modifiable>false }: { modifiable: Modifiable }): Modifiable extends true ? MeshInfoModifiable : MeshInfoBuffers {
        const { vertices, faces, edges } = this.info
        const info = <Modifiable extends true ? MeshInfoModifiable : MeshInfoBuffers>(
            modifiable ? {
                vertices: {
                    x: new Array(vertices.x),
                    y: new Array(vertices.y),
                    z: new Array(vertices.z),
                },
                faces: {
                    indicesOffset1: new Array(faces.indicesOffset1),
                    indices: new Array(faces.indices),
                },
                edges: {
                    creased: new Set<string>(edges?.creased ?? []),
                },
            } : {
                vertices: {
                    x: new Float32Array(vertices.x),
                    y: new Float32Array(vertices.y),
                    z: new Float32Array(vertices.z),
                },
                faces: {
                    indicesOffset1: new Uint32Array(faces.indicesOffset1),
                    indices: new Uint32Array(faces.indices),
                },
                edges: {
                    creased: new Set<string>(edges?.creased ?? []),
                }
            }
        )

        return info
    }

    clone<Modifiable extends boolean = false>(settings: { modifiable: Modifiable }): Mesh<ReturnType<typeof this.cloneInfo<Modifiable>>> {
        return new Mesh(this.cloneInfo(settings))
    }

    face_adjacent(faceEdge: FaceEdge) {
        return Mesh.face_adjacent(this.info, faceEdge)
    }

    static face_adjacent(info: MeshInfo, { face, edge }: FaceEdge): FaceEdgeOriented | undefined {
        const { indices, indicesOffset1 } = info.faces

        const i0 = face.vertices[edge]!
        const i1 = face.vertices[(edge + 1) % face.edges]!
        let j0: number, j1: number
        let order: EdgeVertexOrder | undefined

        for (let face1 = 0, offset0 = 0, offset1: number;
            face1 < indicesOffset1.length;
            face1++, offset0 = offset1) {
            offset1 = indicesOffset1[face1]!
            if (face1 === face.index)
                continue
            
            for (j0 = offset0, j1 = offset0 + 1;
                j0 !== offset1;
                j0++, ((((j1 + 1) === offset1) ? (j1 = offset0) : j1++))) {
                if (indices[j0] === i0 && indices[j1] === i1)
                    order = EdgeVertexOrder.v01
                else if (indices[j1] === i0 && indices[j0] === i1)
                    order = EdgeVertexOrder.v10

                if (order !== undefined) {
                    return {
                        faceEdge: {
                            face: Mesh.face(info, face1),
                            edge: j0 - offset0,
                        },
                        order,
                    }
                }
            }
        }

        return undefined
    }

    edges_with(vertex: number) {
        return Mesh.edges_with(this.info, vertex)
    }

    static edges_with(info: MeshInfo, vertex: number): FaceEdgeOriented[] {
        const edges: FaceEdgeOriented[] = []
        const { indices, indicesOffset1 } = info.faces

        for (let face_i = 0, offset0 = 0, offset1: number;
            face_i < indicesOffset1.length;
            face_i++, offset0 = offset1) {
            offset1 = indicesOffset1[face_i]!
            
            for (let v0 = offset0, v1 = offset0 + 1;
                v0 !== offset1;
                v0++, v1 = (((v1 + 1) === offset1) ? offset0 : v1 + 1)) {
                if (indices[v0] === vertex || indices[v1] === vertex) {
                    const face = Mesh.face(info, face_i)
                    const edge = v0 - offset0

                    edges.push({
                        faceEdge: { face, edge },
                        order: indices[v0] === vertex ? EdgeVertexOrder.v01 : EdgeVertexOrder.v10,
                    })
                }
            }
        }

        return edges
    }

    vertex_neighbors<NoteDiscontinuity extends boolean>(vertex: number, edge_0?: FaceEdge, note_discontinuity = <NoteDiscontinuity>false): (VertexNeighbor | (NoteDiscontinuity extends true ? boolean : never))[] {
        return Mesh.vertex_neighbors<NoteDiscontinuity>(this.info, vertex, edge_0, note_discontinuity)
    }

    static vertex_neighbors<NoteDiscontinuity extends boolean>(info: MeshInfo, vertex: number, edge_0?: FaceEdge, note_discontinuity = <NoteDiscontinuity>false): (VertexNeighbor | (NoteDiscontinuity extends true ? boolean : never))[] {
        const edges = Mesh.edges_with(info, vertex).map<FaceEdgeOrientedKeyed>(faceEdgeOriented => ({
            ...faceEdgeOriented,
            key: edgeKey(faceEdgeOriented.faceEdge)
        }))
        
        function findIndex<T, T1 extends T>(arr: T[], filter: (t: T) => t is T1, pred: (t: T1) => boolean): number {
            for (const [i, x] of arr.entries()) {
                if (filter(x) && pred(x))
                    return i
            }

            return -1
        }

        function findRemove<T, ThrowIfMissing extends boolean>(arr: T[], pred: (t: T) => boolean, throwIfMissing?: ThrowIfMissing): T | (ThrowIfMissing extends true ? never : undefined) {
            for (const [i, x] of arr.entries()) {
                if (pred(x)) {
                    arr.splice(i, 1)
                    return x
                }
            }

            if (throwIfMissing)
                throw new Error('not found')
            else
                return <T | (ThrowIfMissing extends true ? never : undefined)>undefined
        }

        const twin_edge = (edge: FaceEdgeOrientedKeyed) => findRemove(edges, ({ key }) => key === edge.key, false)
        const face_second_edge = (edge: FaceEdgeOrientedKeyed) => findRemove(edges, ({ faceEdge: { face: face1 } }) => edge.faceEdge.face.index === face1.index, true)
        const neighbors: (VertexNeighbor | boolean)[] = []

        // random edge selected to start
        const edge0 = edges.pop()!
        for (let edge: FaceEdgeOrientedKeyed | undefined = edge0; edge; ) {
            const edge1 = face_second_edge(edge)
            neighbors.push({
                face: edge.faceEdge.face,
                edges: [edge, edge1]
            })

            edge = twin_edge(edge1)
        }

        const continuous = edges.length === 0
        if (note_discontinuity && !continuous)
            neighbors.push(continuous)

        if (edges.length) {
            for (let edge = twin_edge(edge0); edge;) {
                const edge1 = face_second_edge(edge)
                neighbors.unshift({
                    face: edge.faceEdge.face,
                    edges: [edge1, edge]
                })

                edge = twin_edge(edge1)
            }
        }

        if (edge_0) {
            const neighbor_0_i = findIndex(
                neighbors,
                neighbor => typeof neighbor !== 'boolean',
                ({ face, edges }) => (
                    face.index === edge_0.face.index && (
                        edges[0].faceEdge.edge === edge_0.edge ||
                        edges[1].faceEdge.edge === edge_0.edge
                    )
                )
            )

            if (neighbor_0_i === -1)
                throw new Error('edge_0 not found')

            const neighbor_0 = <VertexNeighbor>neighbors[neighbor_0_i]
            if (neighbor_0.edges[0].faceEdge.edge === edge_0.edge) {
                // just need to reorder [...A, [edge_0, ...], ...B] => [[edge_0, ...], ...B, ...A]
                neighbors.unshift(...neighbors.splice(neighbor_0_i))
            }
            else {
                // need to reorder [...A, [..., edge_0], ...B] => [[edge_0, ...], ...A, ...B]
                // [...A, X, ...B] => [...B, ...A, X] => [X, ...A^-1, ...B^-1]
                // reverse each edges pair
                // reverse array
                neighbors.unshift(...neighbors.splice(neighbor_0_i + 1))

                for (const { edges } of neighbors.filter(_ => typeof _ !== 'boolean'))
                    edges.reverse()
                
                neighbors.reverse()
            }
        }

        if (note_discontinuity && continuous)
            neighbors.push(continuous)

        return <ReturnType<typeof this.vertex_neighbors<NoteDiscontinuity>>>neighbors
    }

    vertex(index: number) {
        return Mesh.vertex(this.info, index)
    }

    static vertex(info: MeshInfo, index: number): Vector3Tuple {
        if (index < 0 || index >= info.vertices.x.length)
            throw new Error('vertex out of bounds')

        return [
            info.vertices.x[index]!,
            info.vertices.y[index]!,
            info.vertices.z[index]!,
        ]
    }

    face(index: number) {
        return Mesh.face(this.info, index)
    }

    static face(info: MeshInfo, index: number): Face {
        if (index < 0 || index >= info.faces.indicesOffset1.length)
            throw new Error('face out of bounds')

        const offset0 = index === 0 ? 0 : info.faces.indicesOffset1[index - 1]!
        const offset1 = info.faces.indicesOffset1[index]!
        const vertices = info.faces.indices instanceof Uint32Array
            ? info.faces.indices.subarray(offset0, offset1)
            : new Uint32Array(offset1 - offset0).fill(0).map((_, i) => info.faces.indices[offset0 + i]!)

        return {
            index,
            edges: offset1 - offset0,
            vertices,
            indicesOffset: [offset0, offset1]
        }
    }

    static examples() {
        return {
            cube: new MeshAccelerated({
                vertices: {
                    x: new Float32Array([-1, +1, +1, -1, -1, +1, +1, -1]),
                    y: new Float32Array([-1, -1, +1, +1, -1, -1, +1, +1]),
                    z: new Float32Array([-1, -1, -1, -1, +1, +1, +1, +1]),
                },
                faces: {
                    indicesOffset1: new Uint32Array([
                        4,
                        8,
                        12,
                        16,
                        20,
                        24,
                    ]),
                    indices: new Uint32Array([
                        // front
                        0, 1, 2, 3,
                        // back
                        4, 5, 6, 7,
                        // top
                        0, 1, 5, 4,
                        // bottom
                        3, 2, 6, 7,
                        // right
                        1, 2, 6, 5,
                        // left
                        0, 3, 7, 4,
                    ]),
                },
                edges: {
                    creased: new Set<string>([
                        "0-1",
                        "1-2",
                        "2-3",
                        "3-0",
                        "4-5",
                        "5-6",
                        "6-7",
                        "7-4",
                        "0-4",
                        "1-5",
                        "2-6",
                        "3-7",
                    ]),
                },
            }),
        } as const
    }

    accelerated() {
        const info = isMeshInfoBuffers(this.info) ? this.info : this.cloneInfo({ modifiable: false })
        return new MeshAccelerated(info)
    }
}

export class MeshAccelerated extends Mesh<MeshInfoBuffers> {
    override accelerated(): MeshAccelerated {
        return this
    }

    vertexInfoMean(vertices: Uint32Array) {
        let c_x = 0
        let c_y = 0
        let c_z = 0

        const { x, y, z } = this.info.vertices
        let vertex: number
        const n = vertices.length
        for (let i = 0; i < n; i++) {
            vertex = vertices[i]!
            c_x += x[vertex]!
            c_y += y[vertex]!
            c_z += z[vertex]!
        }

        c_x /= n
        c_y /= n
        c_z /= n

        return {
            center: <Vector3Tuple>[c_x, c_y, c_z],
        }
    }

    faceInfoMean(faces: Uint32Array) {
        const normals_x = new Float32Array(faces.length)
        const normals_y = new Float32Array(faces.length)
        const normals_z = new Float32Array(faces.length)

        const centers_x = new Float32Array(faces.length)
        const centers_y = new Float32Array(faces.length)
        const centers_z = new Float32Array(faces.length)

        const { x, y, z } = this.info.vertices
        const { indicesOffset1, indices } = this.info.faces

        let v0_x: number
        let v0_y: number
        let v0_z: number
        let v1_x: number
        let v1_y: number
        let v1_z: number
        let v2_x: number
        let v2_y: number
        let v2_z: number
        let v01_x: number
        let v01_y: number
        let v01_z: number
        let v02_x: number
        let v02_y: number
        let v02_z: number
        
        let n_x: number
        let n_y: number
        let n_z: number

        let c_x: number
        let c_y: number
        let c_z: number

        const n = faces.length
        let face: number
        let offset0: number
        let offset1: number
        let k: number   

        for (let i = 0; i < n; i++) {
            face = faces[i]!
            offset0 = face === 0 ? 0 : indicesOffset1[face - 1]!
            offset1 = indicesOffset1[face]!
            k = offset1 - offset0

            c_x = 0
            c_y = 0
            c_z = 0
            
            for (let j = 0; j < k; j++) {
                const vertex = indices[offset0 + j]!
                c_x += x[vertex]!
                c_y += y[vertex]!
                c_z += z[vertex]!
            }

            centers_x[i] = c_x / k
            centers_y[i] = c_y / k
            centers_z[i] = c_z / k

            v0_x = x[indices[offset0]!]!
            v0_y = y[indices[offset0]!]!
            v0_z = z[indices[offset0]!]!

            v1_x = x[indices[offset0 + 1]!]!
            v1_y = y[indices[offset0 + 1]!]!
            v1_z = z[indices[offset0 + 1]!]!

            v2_x = x[indices[offset0 + 2]!]!
            v2_y = y[indices[offset0 + 2]!]!
            v2_z = z[indices[offset0 + 2]!]!

            v01_x = v1_x - v0_x
            v01_y = v1_y - v0_y
            v01_z = v1_z - v0_z

            v02_x = v2_x - v0_x
            v02_y = v2_y - v0_y
            v02_z = v2_z - v0_z

            n_x = v01_y * v02_z - v01_z * v02_y
            n_y = v01_z * v02_x - v01_x * v02_z
            n_z = v01_x * v02_y - v01_y * v02_x

            normals_x[i] = n_x
            normals_y[i] = n_y
            normals_z[i] = n_z
        }

        // average centers
        c_x = 0
        c_y = 0
        c_z = 0

        for (let i = 0; i < n; i++) {
            c_x += centers_x[i]!
            c_y += centers_y[i]!
            c_z += centers_z[i]!
        }

        c_x /= n
        c_y /= n
        c_z /= n

        // average normals

        n_x = 0
        n_y = 0
        n_z = 0

        for (let i = 0; i < n; i++) {
            n_x += normals_x[i]!
            n_y += normals_y[i]!
            n_z += normals_z[i]!
        }

        n_x /= n
        n_y /= n
        n_z /= n

        return {
            center: <Vector3Tuple>[c_x, c_y, c_z],
            normal: <Vector3Tuple>[n_x, n_y, n_z],
        }
    }
}
