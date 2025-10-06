import { ArrayGeometryInternalMap, ArrayGeometryMap, Geometry, GeometryFunction, IdentityGeometryMap } from "../geometry.js";
import { MeshAccelerated, MeshInfoBuffers } from "../mesh.js";

export class TriangulateGeometryFunction implements GeometryFunction {
    mesh!: MeshAccelerated
    map = {
        vertex: new IdentityGeometryMap(),
        face: new ArrayGeometryMap()
    } as const

    constructor(readonly base: Geometry) {
        this.update()
    }
    
    update(): void {
        const info = this.base.mesh.info
        const {
            indices: indices_base_faces0,
            indicesOffset1: indicesOffset1_base_faces
        } = info.faces
        const indices_base_faces = indices_base_faces0 instanceof Uint32Array ? indices_base_faces0 : new Uint32Array(indices_base_faces0)
    
        // greatest possible is one ngon for all indices, converted to triangles
        const greatest_possible_tris = indices_base_faces.length - indicesOffset1_base_faces.length - 1
        const tris_indices = new Uint32Array(greatest_possible_tris * 3) // resized to # tris * 3
        const tris_indicesOffset1 = new Uint32Array(greatest_possible_tris) // resized to # tris
        let n_tris = 0

        const faces_map_base2self_0: ArrayGeometryInternalMap = {
            offset1: new Uint32Array(indicesOffset1_base_faces.length), // # of base faces
            indices: new Uint32Array(greatest_possible_tris), // resized to # tris
            transforms: new Float32Array(greatest_possible_tris * 16), // resized to # tris * 16
        }

        const faces_map_self2base_0: ArrayGeometryInternalMap = {
            offset1: new Uint32Array(greatest_possible_tris), // resized to # of tris
            indices: new Uint32Array(greatest_possible_tris), // resized to # of tris
            transforms: new Float32Array(greatest_possible_tris * 16), // resized to # of tris * 16
        }
    
        for (let i_base_face = 0, offset0_base_faces = 0, offset1_base_faces: number,
            n_tris_base_face: number, i_tri_base_face: number;
            i_base_face < indicesOffset1_base_faces.length;
            i_base_face++, offset0_base_faces = offset1_base_faces) {
            offset1_base_faces = indicesOffset1_base_faces[i_base_face]!
            const indices_base_face = indices_base_faces.subarray(offset0_base_faces, offset1_base_faces)
            n_tris_base_face = indices_base_face.length - 2
            for (i_tri_base_face = 0;
                i_tri_base_face < n_tris_base_face;
                i_tri_base_face++, n_tris++) {
                // ngon -> triangles
                // ngon assumed to be convex, planar
                // triangle fan
                
                tris_indices[n_tris * 3 + 0] = indices_base_face[0]!
                tris_indices[n_tris * 3 + 1] = indices_base_face[i_tri_base_face + 1]!
                tris_indices[n_tris * 3 + 2] = indices_base_face[i_tri_base_face + 2]!
                tris_indicesOffset1[n_tris] = (n_tris + 1) * 3

                faces_map_self2base_0.offset1[n_tris] = n_tris + 1
                faces_map_self2base_0.indices[n_tris] = i_base_face
                faces_map_self2base_0.transforms[n_tris * 16 + 0] = 1
                faces_map_self2base_0.transforms[n_tris * 16 + 5] = 1
                faces_map_self2base_0.transforms[n_tris * 16 + 10] = 1

                faces_map_base2self_0.indices[n_tris] = n_tris
                faces_map_base2self_0.transforms[n_tris * 16 + 0] = 1
                faces_map_base2self_0.transforms[n_tris * 16 + 5] = 1
                faces_map_base2self_0.transforms[n_tris * 16 + 10] = 1
            }
            
            // base face [i] -> tris [(n_tris before previous loop), (n_tris after previous loop)]
            faces_map_base2self_0.offset1[i_base_face] = n_tris
        }

        const info1: MeshInfoBuffers = {
            vertices: info.vertices,
            faces: {
                indicesOffset1: tris_indicesOffset1.subarray(0, n_tris),
                indices: tris_indices.subarray(0, n_tris * 3),
            },
            edges: info.edges,
        }

        this.mesh = new MeshAccelerated(info1)
        this.map.face.base2self = {
            offset1: faces_map_base2self_0.offset1,
            indices: faces_map_base2self_0.indices.subarray(0, n_tris),
            transforms: faces_map_base2self_0.transforms.subarray(0, n_tris * 16),
        }
        this.map.face.self2base = {
            offset1: faces_map_self2base_0.offset1.subarray(0, n_tris),
            indices: faces_map_self2base_0.indices.subarray(0, n_tris),
            transforms: faces_map_self2base_0.transforms.subarray(0, n_tris * 16),
        }
    }
}
