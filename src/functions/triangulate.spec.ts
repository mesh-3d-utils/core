import test from "ava"
import { TriangulateGeometryFunction } from "./triangulate.js"
import { MeshGeometry } from "../geometry.js"
import { Mesh } from "../mesh.js"

test("# of vertices and faces", (t) => {
    const geometry = new TriangulateGeometryFunction(new MeshGeometry(Mesh.examples().cube))
    t.is(geometry.base.mesh.vertices.x.length, 8)
    t.is(geometry.base.mesh.faces.indicesOffset1.length, 6)
    t.is(geometry.mesh.vertices.x.length, 8)
    t.is(geometry.mesh.faces.indicesOffset1.length, 6 * 2)
})
