import test from "ava"
import { Mesh } from "./mesh.js"

test("cube", t => {
    t.not(undefined, Mesh.examples().cube)
})

test("face", t => {
    const cube = Mesh.examples().cube
    const face0 = cube.face(0)
    t.is(face0.edges, 4)
    t.deepEqual(face0.vertices, new Uint32Array([0, 1, 2, 3]))
})

test("face adjacent", t => {
    const cube = Mesh.examples().cube
    const face0 = cube.face(0)
    // const face1 = cube.face(1)
    const face2 = cube.face(2)
    const face3 = cube.face(3)
    const face4 = cube.face(4)
    const face5 = cube.face(5)

    const face0_0 = cube.face_adjacent({ face: face0, edge: 0 })
    const face0_1 = cube.face_adjacent({ face: face0, edge: 1 })
    const face0_2 = cube.face_adjacent({ face: face0, edge: 2 })
    const face0_3 = cube.face_adjacent({ face: face0, edge: 3 })
    t.not(face0_0, undefined)
    t.not(face0_1, undefined)
    t.not(face0_2, undefined)
    t.not(face0_3, undefined)

    t.deepEqual(face0_0!.faceEdge, { face: face2, edge: 0 })
    t.deepEqual(face0_1!.faceEdge, { face: face4, edge: 0 })
    t.deepEqual(face0_2!.faceEdge, { face: face3, edge: 0 })
    t.deepEqual(face0_3!.faceEdge, { face: face5, edge: 0 })
})
