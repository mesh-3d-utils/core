import test, { ExecutionContext } from "ava"
import { ArrayGeometryMap } from "./array.js"
import { IdentityGeometryMap } from "./identity.js"
import { GeometryMap } from "../geometry.js"
import { SymmetricGeometryMap } from "./symmetric.js"
import { Matrix4 } from "three"

interface CompileTest {
    ab: GeometryMap
    bc: GeometryMap
}

function compileTest(t: ExecutionContext, { ab, bc }: CompileTest) {
    const ac = ArrayGeometryMap.compile(ab, bc)
    for (let a = 0; a < ab.lengths.base; a++) {
        const b_ = ab.fromBase(a)
        const c_0 = Array.from(b_.indices).flatMap(b => Array.from(bc.fromBase(b).indices))
        const c_1 = Array.from(ac.fromBase(a).indices)
        const c_0_ = new Set(c_0)
        const c_1_ = new Set(c_1)
        t.deepEqual(c_0_, c_1_)
    }
}

const cases: CompileTest[] = [
    {
        ab: new IdentityGeometryMap(4),
        bc: new IdentityGeometryMap(4),
    },
    {
        ab: new SymmetricGeometryMap({
            base2self: {
                index: new Uint32Array([1, 4, 3, 5, 2, 0]),
                transform: new Float32Array([
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                ])
            }
        }),
        bc: new SymmetricGeometryMap({
            base2self: {
                index: new Uint32Array([4, 1, 2, 5, 3, 0]),
                transform: new Float32Array([
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                    ...new Matrix4().identity().toArray(),
                ])
            }
        }),
    },
    {
        ab: new ArrayGeometryMap({
            base2self: ArrayGeometryMap.map(
                [
                    // face 0 in base maps to four faces in self
                    {
                        index: 0,
                        transform: new Matrix4().identity()
                    },
                    {
                        index: 1,
                        transform: new Matrix4().identity()
                    },
                    {
                        index: 2,
                        transform: new Matrix4().identity()
                    },
                    {
                        index: 3,
                        transform: new Matrix4().identity()
                    }
                ]
            ),
            self2base: ArrayGeometryMap.map(
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    },
                ],
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    }
                ],
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    }
                ],
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    }
                ]
            ),
        }),
        bc: new IdentityGeometryMap(4),
    },
    {
        ab: new ArrayGeometryMap({
            // a quad is mapped to two triangles
            base2self: ArrayGeometryMap.map(
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity()
                    },
                    {
                        index: 1,
                        transform: new Matrix4().identity()
                    }
                ]
            ),
            self2base: ArrayGeometryMap.map(
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    },
                ],
                [
                    {
                        index: 1,
                        transform: new Matrix4().identity().invert()
                    }
                ]
            )
        }),
        bc: new ArrayGeometryMap({
            base2self: ArrayGeometryMap.map(
                // the first triangle is subdivided, the second kept
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity()
                    },
                    {
                        index: 1,
                        transform: new Matrix4().identity()
                    }
                ],
                [
                    {
                        index: 2,
                        transform: new Matrix4().identity()
                    }
                ]
            ),
            self2base: ArrayGeometryMap.map(
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    },
                ],
                [
                    {
                        index: 0,
                        transform: new Matrix4().identity().invert()
                    }
                ],
                [
                    {
                        index: 1,
                        transform: new Matrix4().identity().invert()
                    }
                ]
            )
        })
    }
]

for (let i = 0; i < cases.length; i++)
    test(`compile ${i}`, t => compileTest(t, cases[i]!))
