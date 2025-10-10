import { GeometryMap } from "../geometry.js"
import { ArrayGeometryMap } from "./array.js"
import { IdentityGeometryMap } from "./identity.js"

export function compileGeometryMaps(n: number, ...maps: GeometryMap[]): GeometryMap {
    if (maps.length === 0)
        return new IdentityGeometryMap(n)
    
    if (maps.length === 1)
        return maps[0]!
    
    const ab = maps[0]!
    const bc = compileGeometryMaps(n, ...maps.slice(1))
    if (ab.lengths.self !== bc.lengths.base)
        throw new Error("lengths do not match")

    return ArrayGeometryMap.compile(ab, bc)
}
