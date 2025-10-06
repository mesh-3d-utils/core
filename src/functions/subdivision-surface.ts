import { ArrayGeometryMap, Geometry, GeometryFunction } from "../geometry.js"
import { Mesh, MeshAccelerated, edgeKey1 } from "../mesh.js"
import { Matrix4, Vector3 } from "three"

interface Adjacency {
    edgeToFaces: Map<string, number[]>
    vertexToFaces: Map<number, number[]>
    vertexValence: Map<number, number>
    sharpEdges: ReadonlySet<string>
}

export enum SubdivisionMethod {
    CatmullClark = 'catmull-clark',
}

/**
 * A subdivision surface from a mesh cage and user-defined sharp/crease edges
 * 
 * Confusingly, this is not a topology surface
 */
export class SubdivisionSurfaceGeometry implements GeometryFunction {
    method = SubdivisionMethod.CatmullClark
    boundaryAsCrease = true
    iterations = 1

    mesh!: MeshAccelerated
    map!: {
        vertex: ArrayGeometryMap
        face: ArrayGeometryMap
    }

    constructor(
        readonly base: Geometry,
    ) {
        this.update()
    }

    update() {
        this.mesh = this.base.mesh
        this.map = {
            vertex: ArrayGeometryMap.identity(this.mesh.vertices.x.length),
            face: ArrayGeometryMap.identity(this.mesh.faces.indicesOffset1.length),
        }

        for (let i = 0; i < this.iterations; i++) {
            switch (this.method) {
                case SubdivisionMethod.CatmullClark:
                    this.#subdivide_catmullClark()
                    break
                default:
                    throw new Error('unknown subdivision method')
            }
        }
    }

    #getNeighboringEdges(vertexIndex: number, adjacency: Adjacency): string[] {
        const edges = new Set<string>()
        const adjacentFaces = adjacency.vertexToFaces.get(vertexIndex) ?? []
        for (const faceIndex of adjacentFaces) {
            const face = this.mesh.face(faceIndex)
            for (let i = 0; i < face.vertices.length; i++) {
                const v0 = face.vertices[i]!
                if (v0 === vertexIndex) {
                    const vPrev = face.vertices[(i - 1 + face.vertices.length) % face.vertices.length]!
                    const vNext = face.vertices[(i + 1) % face.vertices.length]!
                    edges.add(edgeKey1(v0, vPrev))
                    edges.add(edgeKey1(v0, vNext))
                }
            }
        }
        return [...edges]
    }

    #getCreaseNeighbors(vertexIndex: number, creaseEdges: string[]): [number, number] {
        const neighbors = new Set<number>()
        for (const edge of creaseEdges) {
            const [v0, v1] = edge.split('_').map(Number) as [number, number]
            if (v0 === vertexIndex) neighbors.add(v1)
            if (v1 === vertexIndex) neighbors.add(v0)
        }
        const result = [...neighbors]
        if (result.length === 1) {
            // Boundary case with only one neighbor, treat as corner by using itself
            return [result[0]!, result[0]!]
        }
        if (result.length === 0) {
            // Isolated crease vertex, treat as corner
            return [vertexIndex, vertexIndex];
        }
        return result as [number, number]
    }

    #buildAdjacency(): Adjacency {
        const mesh = this.mesh
        const edgeToFaces = new Map<string, number[]>()
        const vertexToFaces = new Map<number, number[]>()
        const vertexValence = new Map<number, number>()
        const sharpEdges = new Set<string>()

        for (let faceIdx = 0; faceIdx < mesh.faces.indicesOffset1.length; faceIdx++) {
            const face = mesh.face(faceIdx)
            for (let i = 0; i < face.vertices.length; i++) {
                const v0 = face.vertices[i]!
                const v1 = face.vertices[(i + 1) % face.vertices.length]!
                const edgeKey = edgeKey1(v0, v1)

                if (!edgeToFaces.has(edgeKey)) {
                    edgeToFaces.set(edgeKey, [faceIdx])
                } else {
                    edgeToFaces.get(edgeKey)!.push(faceIdx)
                }

                if (!vertexToFaces.has(v0)) {
                    vertexToFaces.set(v0, [faceIdx])
                } else {
                    vertexToFaces.get(v0)!.push(faceIdx)
                }

                if (!vertexToFaces.has(v1)) {
                    vertexToFaces.set(v1, [faceIdx])
                } else {
                    vertexToFaces.get(v1)!.push(faceIdx)
                }

                if (mesh.edges.creased.has(edgeKey))
                    sharpEdges.add(edgeKey)
            }
        }

        for (const [vertexIndex, faces] of vertexToFaces.entries())
            vertexValence.set(vertexIndex, faces.length)

        if (this.boundaryAsCrease)
            for (const [edgeKeyStr, faces] of edgeToFaces.entries())
                if (faces.length === 1)
                    sharpEdges.add(edgeKeyStr)

        return {
            edgeToFaces,
            vertexToFaces,
            vertexValence,
            sharpEdges: new Set(sharpEdges),
        }
    }

    
    #subdivide_catmullClark() {
        const mesh = this.mesh
        const prevFaceMap = this.map.face
        const prevVertexMap = this.map.vertex
        const newMesh = mesh.clone({ modifiable: true })
        const adjacency = this.#buildAdjacency()

        // Mapping accumulators
        const baseVertexCount = mesh.vertices.x.length
        const baseFaceCount = mesh.faces.indicesOffset1.length

        // vertex: self -> base
        const v_self2base_indices: number[] = []
        const v_self2base_offset1: number[] = []
        const v_self2base_transforms: number[] = []

        // vertex: base -> self (lists, flattened later)
        const v_base2self_lists: number[][] = Array.from({ length: baseVertexCount }, () => [])

        function pushIdentityTransforms(n: number) {
            for (let i = 0; i < n; i++) {
                v_self2base_transforms.push(
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1,
                )
            }
        }

        function addVertexMapping(selfIndex: number, baseIndices: Uint32Array | number[]) {
            for (const b of baseIndices)
                v_self2base_indices.push(b)

            const lastOffset = v_self2base_offset1.length ? v_self2base_offset1[v_self2base_offset1.length - 1]! : 0
            v_self2base_offset1.push(lastOffset + baseIndices.length)

            pushIdentityTransforms(baseIndices.length)

            for (const b of baseIndices)
                if (b >= 0 && b < baseVertexCount)
                    v_base2self_lists[b]!.push(selfIndex)
        }

        // Initialize original vertices mapping as identity
        for (let v = 0; v < baseVertexCount; v++)
            addVertexMapping(v, [v])

        function addVertex(x: number, y: number, z: number): number {
            newMesh.vertices.x.push(x)
            newMesh.vertices.y.push(y)
            newMesh.vertices.z.push(z)
            return newMesh.vertices.x.length - 1
        }

        const faceToPointIndex = new Map<number, number>()
        const edgeToPointIndex = new Map<string, number>()

        // face mapping accumulators
        const f_self2base_indices: number[] = []
        const f_self2base_offset1: number[] = []
        const f_self2base_transforms: number[] = []
        const f_base2self_lists: number[][] = Array.from({ length: baseFaceCount }, () => [])

        function addFaceMapping(selfFaceIndex: number, baseFaceIndex: number, transform: Matrix4) {
            f_self2base_indices.push(baseFaceIndex)
            const lastOffset = f_self2base_offset1.length ? f_self2base_offset1[f_self2base_offset1.length - 1]! : 0
            f_self2base_offset1.push(lastOffset + 1)

            f_self2base_transforms.push(...transform.toArray())

            if (baseFaceIndex >= 0 && baseFaceIndex < baseFaceCount)
                f_base2self_lists[baseFaceIndex]!.push(selfFaceIndex)
        }

        function computeFaceFrame(vertices: Uint32Array, m: Mesh) {
            const c = new Vector3(0, 0, 0)
            for (const vi of vertices)
                c.add(new Vector3(m.info.vertices.x[vi]!, m.info.vertices.y[vi]!, m.info.vertices.z[vi]!))
            c.multiplyScalar(1 / vertices.length)

            const v0 = new Vector3(m.info.vertices.x[vertices[0]!]!, m.info.vertices.y[vertices[0]!]!, m.info.vertices.z[vertices[0]!]!)
            const n = new Vector3(0, 0, 0)
            for (let i = 1; i + 1 < vertices.length; i++) {
                const v1 = new Vector3(m.info.vertices.x[vertices[i]!]!, m.info.vertices.y[vertices[i]!]!, m.info.vertices.z[vertices[i]!]!)
                const v2 = new Vector3(m.info.vertices.x[vertices[i + 1]!]!, m.info.vertices.y[vertices[i + 1]!]!, m.info.vertices.z[vertices[i + 1]!]!)
                n.add(v1.clone().sub(v0).cross(v2.clone().sub(v0)))
            }
            n.normalize()

            const e = new Vector3(
                m.info.vertices.x[vertices[1]!]! - m.info.vertices.x[vertices[0]!]!,
                m.info.vertices.y[vertices[1]!]! - m.info.vertices.y[vertices[0]!]!,
                m.info.vertices.z[vertices[1]!]! - m.info.vertices.z[vertices[0]!]!,
            )
            const t = e.clone().sub(n.clone().multiplyScalar(e.dot(n))).normalize()
            const b = n.clone().cross(t)
            return { origin: c, t, b, n }
        }

        function frameToMatrix(from: { t: Vector3, b: Vector3, n: Vector3, origin: Vector3 }, to: { t: Vector3, b: Vector3, n: Vector3, origin: Vector3 }): Matrix4 {
            const R = new Matrix4().set(
                to.t.x, to.b.x, to.n.x, 0,
                to.t.y, to.b.y, to.n.y, 0,
                to.t.z, to.b.z, to.n.z, 0,
                0, 0, 0, 1,
            )
            const FT = new Matrix4().set(
                from.t.x, from.t.y, from.t.z, 0,
                from.b.x, from.b.y, from.b.z, 0,
                from.n.x, from.n.y, from.n.z, 0,
                0, 0, 0, 1,
            ).transpose()
            const rot = R.clone().multiply(FT)
            const t = to.origin.clone().sub(from.origin)
            const M = rot.clone()
            const e = M.elements
            e[12] += t.x
            e[13] += t.y
            e[14] += t.z
            return M
        }

        function computeVertexFrame(v: number, m: Mesh) {
            // origin at vertex position
            const origin = new Vector3(m.vertices.x[v]!, m.vertices.y[v]!, m.vertices.z[v]!)

            // normal: average adjacent face normals
            const neighbors = m.vertex_neighbors(v)
            const n = new Vector3(0, 0, 0)
            for (const nb of neighbors) {
                if (typeof nb === 'boolean') continue
                const fn = computeFaceFrame(nb.face.vertices, m).n
                n.add(fn)
            }
            if (n.lengthSq() === 0) n.set(0, 0, 1)
            n.normalize()

            // tangent: from one incident edge, projected onto plane
            const edges = m.edges_with(v)
            let t = new Vector3(1, 0, 0)
            if (edges.length) {
                const e0 = edges[0]!
                const i0 = e0.faceEdge.face.vertices[e0.faceEdge.edge]!
                const i1 = e0.faceEdge.face.vertices[(e0.faceEdge.edge + 1) % e0.faceEdge.face.edges]!
                const other = (i0 === v) ? i1 : i0
                t = new Vector3(
                    m.vertices.x[other]! - m.vertices.x[v]!,
                    m.vertices.y[other]! - m.vertices.y[v]!,
                    m.vertices.z[other]! - m.vertices.z[v]!,
                )
                // project to plane
                t.sub(n.clone().multiplyScalar(t.dot(n)))
                if (t.lengthSq() === 0) t.set(1, 0, 0)
                t.normalize()
            }
            const b = n.clone().cross(t)
            return { origin, t, b, n }
        }

        // 1. Create face points
        for (let faceIdx = 0; faceIdx < mesh.faces.indicesOffset1.length; faceIdx++) {
            const face = mesh.face(faceIdx)
            let sumX = 0, sumY = 0, sumZ = 0
            for (const vIdx of face.vertices) {
                sumX += mesh.vertices.x[vIdx]!
                sumY += mesh.vertices.y[vIdx]!
                sumZ += mesh.vertices.z[vIdx]!
            }
            const n = face.edges
            const newIndex = addVertex(sumX / n, sumY / n, sumZ / n)
            faceToPointIndex.set(faceIdx, newIndex)
            // face point maps to all original vertices of this face
            addVertexMapping(newIndex, face.vertices)
        }

        // 2. Create edge points
        for (const [edgeKey, faces] of adjacency.edgeToFaces.entries()) {
            const [v0, v1] = edgeKey.split('_').map(Number) as [number, number]
            let newX: number, newY: number, newZ: number

            if (adjacency.sharpEdges.has(edgeKey)) {
                // Sharp edge: average of endpoints
                newX = (mesh.vertices.x[v0]! + mesh.vertices.x[v1]!) / 2
                newY = (mesh.vertices.y[v0]! + mesh.vertices.y[v1]!) / 2
                newZ = (mesh.vertices.z[v0]! + mesh.vertices.z[v1]!) / 2
            } else {
                // Smooth edge: average of endpoints and adjacent face points
                if (faces.length === 2) {
                    const f0 = faces[0]!
                    const f1 = faces[1]!
                    const fp0Idx = faceToPointIndex.get(f0)!
                    const fp1Idx = faceToPointIndex.get(f1)!

                    newX = (mesh.vertices.x[v0]! + mesh.vertices.x[v1]! + newMesh.vertices.x[fp0Idx]! + newMesh.vertices.x[fp1Idx]!) / 4
                    newY = (mesh.vertices.y[v0]! + mesh.vertices.y[v1]! + newMesh.vertices.y[fp0Idx]! + newMesh.vertices.y[fp1Idx]!) / 4
                    newZ = (mesh.vertices.z[v0]! + mesh.vertices.z[v1]! + newMesh.vertices.z[fp0Idx]! + newMesh.vertices.z[fp1Idx]!) / 4
                } else {
                    // Non-manifold or unexpected; fall back to averaging endpoints
                    newX = (mesh.vertices.x[v0]! + mesh.vertices.x[v1]!) / 2
                    newY = (mesh.vertices.y[v0]! + mesh.vertices.y[v1]!) / 2
                    newZ = (mesh.vertices.z[v0]! + mesh.vertices.z[v1]!) / 2
                }
            }
            const newIndex = addVertex(newX, newY, newZ)
            edgeToPointIndex.set(edgeKey, newIndex)
            // edge point maps to its two endpoints
            addVertexMapping(newIndex, [v0, v1])
        }

        // 3. Update original vertex positions
        for (let vIdx = 0; vIdx < mesh.vertices.x.length; vIdx++) {
            const neighboringEdges = this.#getNeighboringEdges(vIdx, adjacency)
            const neighboringSharpEdges = neighboringEdges.filter(key => adjacency.sharpEdges.has(key))
            const k = neighboringSharpEdges.length

            if (k < 2) { // Smooth vertex
                const n = neighboringEdges.length
                if (n === 0) continue

                const adjacentFacesAll = adjacency.vertexToFaces.get(vIdx) ?? []
                const adjacentFaces = [...new Set(adjacentFacesAll)]
                if (adjacentFaces.length === 0) continue

                let avgFacePointsX = 0, avgFacePointsY = 0, avgFacePointsZ = 0
                for (const faceIdx of adjacentFaces) {
                    const fpIdx = faceToPointIndex.get(faceIdx)!
                    avgFacePointsX += newMesh.vertices.x[fpIdx]!
                    avgFacePointsY += newMesh.vertices.y[fpIdx]!
                    avgFacePointsZ += newMesh.vertices.z[fpIdx]!
                }
                avgFacePointsX /= adjacentFaces.length
                avgFacePointsY /= adjacentFaces.length
                avgFacePointsZ /= adjacentFaces.length

                let avgEdgeMidpointsX = 0, avgEdgeMidpointsY = 0, avgEdgeMidpointsZ = 0
                for (const edgeKey of neighboringEdges) {
                    const [v0, v1] = edgeKey.split('_').map(Number) as [number, number]
                    avgEdgeMidpointsX += (mesh.vertices.x[v0]! + mesh.vertices.x[v1]!) / 2
                    avgEdgeMidpointsY += (mesh.vertices.y[v0]! + mesh.vertices.y[v1]!) / 2
                    avgEdgeMidpointsZ += (mesh.vertices.z[v0]! + mesh.vertices.z[v1]!) / 2
                }
                avgEdgeMidpointsX /= neighboringEdges.length
                avgEdgeMidpointsY /= neighboringEdges.length
                avgEdgeMidpointsZ /= neighboringEdges.length

                newMesh.vertices.x[vIdx] = (avgFacePointsX + 2 * avgEdgeMidpointsX + (n - 3) * mesh.vertices.x[vIdx]!) / n
                newMesh.vertices.y[vIdx] = (avgFacePointsY + 2 * avgEdgeMidpointsY + (n - 3) * mesh.vertices.y[vIdx]!) / n
                newMesh.vertices.z[vIdx] = (avgFacePointsZ + 2 * avgEdgeMidpointsZ + (n - 3) * mesh.vertices.z[vIdx]!) / n
            } else if (k === 2) { // Crease vertex
                const [vA, vB] = this.#getCreaseNeighbors(vIdx, neighboringSharpEdges)
                newMesh.vertices.x[vIdx] = (mesh.vertices.x[vA]! + 6 * mesh.vertices.x[vIdx]! + mesh.vertices.x[vB]!) / 8
                newMesh.vertices.y[vIdx] = (mesh.vertices.y[vA]! + 6 * mesh.vertices.y[vIdx]! + mesh.vertices.y[vB]!) / 8
                newMesh.vertices.z[vIdx] = (mesh.vertices.z[vA]! + 6 * mesh.vertices.z[vIdx]! + mesh.vertices.z[vB]!) / 8
            } else { // Corner vertex (k > 2)
                // Position remains the same, so no change to finalVertexPositions
            }
        }

        // 4. Create new faces (replace existing faces)
        ;(newMesh.faces.indices as number[]).length = 0
        ;(newMesh.faces.indicesOffset1 as number[]).length = 0
        let currentOffset = 0
        let newFaceIndex = 0
        for (let faceIdx = 0; faceIdx < mesh.faces.indicesOffset1.length; faceIdx++) {
            const face = mesh.face(faceIdx)
            const facePointIndex = faceToPointIndex.get(faceIdx)!
            const parentFrame = computeFaceFrame(face.vertices, mesh)
            const newFaceIndices = new Uint32Array(4)

            for (let i = 0; i < face.vertices.length; i++) {
                const v0 = face.vertices[i]!
                const v1 = face.vertices[(i + 1) % face.vertices.length]!
                const vPrev = face.vertices[(i - 1 + face.vertices.length) % face.vertices.length]!

                const edgePointIndex1 = edgeToPointIndex.get(edgeKey1(v0, v1))!
                const edgePointIndex2 = edgeToPointIndex.get(edgeKey1(vPrev, v0))!

                newFaceIndices[0] = v0
                newFaceIndices[1] = edgePointIndex1
                newFaceIndices[2] = facePointIndex
                newFaceIndices[3] = edgePointIndex2
                    
                newMesh.faces.indices.push(...newFaceIndices)
                currentOffset += newFaceIndices.length
                newMesh.faces.indicesOffset1.push(currentOffset)

                // compute transform from parent face to this child quad
                const childFrame = computeFaceFrame(newFaceIndices, newMesh)
                const M = frameToMatrix(parentFrame, childFrame)
                // new quad maps to its originating base face (with transform)
                addFaceMapping(newFaceIndex, faceIdx, M)
                newFaceIndex++
            }
        }

        this.mesh = newMesh.accelerated()

        // finalize vertex base->self mapping
        const v_base2self_indices: number[] = []
        const v_base2self_offset1: number[] = []
        const v_base2self_transforms: number[] = []
        for (let base = 0; base < v_base2self_lists.length; base++) {
            const lst = v_base2self_lists[base]!
            v_base2self_indices.push(...lst)
            const last = v_base2self_offset1.length ? v_base2self_offset1[v_base2self_offset1.length - 1]! : 0
            v_base2self_offset1.push(last + lst.length)

            for (const self of lst) {
                if (self === base) {
                    // compute transform from previous vertex frame -> new vertex frame
                    const before = computeVertexFrame(base, mesh)
                    const after = computeVertexFrame(self, newMesh)
                    const M = frameToMatrix(before, after)
                    v_base2self_transforms.push(...M.toArray())
                } else {
                    // default identity for non-identity vertex correspondences (edge/face points)
                    v_base2self_transforms.push(
                        1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, 0, 1,
                    )
                }
            }
        }

        // finalize face base->self mapping
        const f_base2self_indices: number[] = []
        const f_base2self_offset1: number[] = []
        const f_base2self_transforms: number[] = []
        for (const lst of f_base2self_lists) {
            f_base2self_indices.push(...lst)
            const last = f_base2self_offset1.length ? f_base2self_offset1[f_base2self_offset1.length - 1]! : 0
            f_base2self_offset1.push(last + lst.length)
            for (let i = 0; i < lst.length; i++) {
                f_base2self_transforms.push(
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1,
                )
            }
        }

        // current iteration maps relative to previous mesh
        const currentVertexMap = new ArrayGeometryMap({
            self2base: {
                indices: new Uint32Array(v_self2base_indices),
                offset1: new Uint32Array(v_self2base_offset1),
                transforms: new Float32Array(v_self2base_transforms),
            },
            base2self: {
                indices: new Uint32Array(v_base2self_indices),
                offset1: new Uint32Array(v_base2self_offset1),
                transforms: new Float32Array(v_base2self_transforms),
            },
        })
        const currentFaceMap = new ArrayGeometryMap({
            self2base: {
                indices: new Uint32Array(f_self2base_indices),
                offset1: new Uint32Array(f_self2base_offset1),
                transforms: new Float32Array(f_self2base_transforms),
            },
            base2self: {
                indices: new Uint32Array(f_base2self_indices),
                offset1: new Uint32Array(f_base2self_offset1),
                transforms: new Float32Array(f_base2self_transforms),
            },
        })

        // compose with previous maps so this.map stays relative to original base
        this.map = {
            vertex: this.#composeArrayGeometryMap(prevVertexMap, currentVertexMap, false),
            face: this.#composeArrayGeometryMap(prevFaceMap, currentFaceMap, true),
        }
    }

    #composeArrayGeometryMap(prev: ArrayGeometryMap, curr: ArrayGeometryMap, multiplyTransforms: boolean): ArrayGeometryMap {
        // compose self2base: curr (self->prev) then prev (prev->base)
        const out_s2b_idx: number[] = []
        const out_s2b_off: number[] = []
        const out_s2b_xf: number[] = []

        const tmpA = new Matrix4()
        const tmpB = new Matrix4()

        for (let i = 0, c_o0 = 0; i < curr.self2base.offset1.length; i++, c_o0 = (i === 0 ? 0 : curr.self2base.offset1[i - 1]!)) {
            const c_o1 = curr.self2base.offset1[i]!
            for (let j = c_o0; j < c_o1; j++) {
                const parent = curr.self2base.indices[j]!
                const p_o0 = parent === 0 ? 0 : prev.self2base.offset1[parent - 1]!
                const p_o1 = prev.self2base.offset1[parent]!

                const currMat = multiplyTransforms ? tmpA.fromArray(curr.self2base.transforms.subarray(j * 16, j * 16 + 16)) : undefined
                for (let k = p_o0; k < p_o1; k++) {
                    out_s2b_idx.push(prev.self2base.indices[k]!)
                    if (multiplyTransforms) {
                        const parentMat = tmpB.fromArray(prev.self2base.transforms.subarray(k * 16, k * 16 + 16))
                        const composed = parentMat.clone().multiply(currMat!)
                        out_s2b_xf.push(...composed.toArray())
                    } else {
                        out_s2b_xf.push(
                            1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0, 0, 0, 1,
                        )
                    }
                }
            }
            const last = out_s2b_off.length ? out_s2b_off[out_s2b_off.length - 1]! : 0
            const added = (i === 0 ? out_s2b_idx.length : out_s2b_idx.length - last)
            out_s2b_off.push(last + added)
        }

        // compose base2self: prev (base->prev) then curr (prev->self)
        const out_b2s_idx: number[] = []
        const out_b2s_off: number[] = []
        const out_b2s_xf: number[] = []

        for (let base = 0, p_o0 = 0; base < prev.base2self.offset1.length; base++, p_o0 = (base === 0 ? 0 : prev.base2self.offset1[base - 1]!)) {
            const p_o1 = prev.base2self.offset1[base]!
            for (let j = p_o0; j < p_o1; j++) {
                const mid = prev.base2self.indices[j]!
                const c_o0 = mid === 0 ? 0 : curr.base2self.offset1[mid - 1]!
                const c_o1 = curr.base2self.offset1[mid]!

                const prevMat = multiplyTransforms ? tmpA.fromArray(prev.base2self.transforms.subarray(j * 16, j * 16 + 16)) : undefined
                for (let k = c_o0; k < c_o1; k++) {
                    out_b2s_idx.push(curr.base2self.indices[k]!)
                    if (multiplyTransforms) {
                        const currMat = tmpB.fromArray(curr.base2self.transforms.subarray(k * 16, k * 16 + 16))
                        const composed = currMat.clone().multiply(prevMat!)
                        out_b2s_xf.push(...composed.toArray())
                    } else {
                        out_b2s_xf.push(
                            1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0, 0, 0, 1,
                        )
                    }
                }
            }
            const last = out_b2s_off.length ? out_b2s_off[out_b2s_off.length - 1]! : 0
            const added = (base === 0 ? out_b2s_idx.length : out_b2s_idx.length - last)
            out_b2s_off.push(last + added)
        }

        return new ArrayGeometryMap({
            self2base: {
                indices: new Uint32Array(out_s2b_idx),
                offset1: new Uint32Array(out_s2b_off),
                transforms: new Float32Array(out_s2b_xf),
            },
            base2self: {
                indices: new Uint32Array(out_b2s_idx),
                offset1: new Uint32Array(out_b2s_off),
                transforms: new Float32Array(out_b2s_xf),
            },
        })
    }
}
