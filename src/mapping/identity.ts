import { Matrix4 } from "three"
import { GeometryMap, GeometryMapping, GeometryMapLengths } from "../geometry.js"

export class IdentityGeometryMap implements GeometryMap {
    get lengths(): Readonly<GeometryMapLengths> {
        return {
            base: this.length,
            self: this.length
        }
    }

    constructor(readonly length: number) { }

    static readonly #transform = new Float32Array(new Matrix4().identity().toArray())

    toBase(index: number): GeometryMapping {
        return {
            indices: new Uint32Array([index]),
            transforms: IdentityGeometryMap.#transform
        }
    }

    fromBase(index: number): GeometryMapping {
        return {
            indices: new Uint32Array([index]),
            transforms: IdentityGeometryMap.#transform
        }
    }
}
