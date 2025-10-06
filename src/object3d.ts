import * as THREE from 'three'
import { Geometry, MeshGeometry } from './geometry.js';
import { TriangulateGeometryFunction } from './functions/triangulate.js';

export interface GeometryObject3D extends THREE.Mesh {
    geometry1?: Geometry
}

export class GeometryMeshObject3DHelper {
    readonly obj: GeometryObject3D
    #geometry: TriangulateGeometryFunction

    get geometry() {
        return this.#geometry
    }

    set geometry(geometry: TriangulateGeometryFunction) {
        this.#geometry = geometry
        this.obj.geometry1 = geometry
    }

    get meshRoot() {
        function meshRoot(geometry: Geometry): MeshGeometry {
            if (geometry instanceof MeshGeometry)
                return geometry
            else if (geometry.base === geometry)
                throw new Error('not a mesh geometry')

            return meshRoot(geometry.base)
        }
        return meshRoot(this.geometry.base)
    }

    constructor(obj: GeometryObject3D | THREE.Mesh) {
        this.obj = obj
        this.#geometry =
            this.obj.geometry1 ? (
                this.obj.geometry1 instanceof TriangulateGeometryFunction ?
                this.obj.geometry1 :
                    new TriangulateGeometryFunction(this.obj.geometry1)
            ) :
            new TriangulateGeometryFunction(MeshGeometry.fromThreeGeometry(obj.geometry))
    }

    update() {
        this.geometry.update()
        this.copyToObj3D()
    }

    copyToObj3D() {
        const bufferGeometry = new THREE.BufferGeometry()
        const positions_x = this.geometry.mesh.vertices.x
        const positions_y = this.geometry.mesh.vertices.y
        const positions_z = this.geometry.mesh.vertices.z
        const positions_array = new Float32Array(positions_x.length * 3)
        for (let i = 0; i < positions_x.length; i++) {
            positions_array[i * 3 + 0] = positions_x[i]!
            positions_array[i * 3 + 1] = positions_y[i]!
            positions_array[i * 3 + 2] = positions_z[i]!
        }
        bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions_array, 3))
        bufferGeometry.setIndex(new THREE.Uint32BufferAttribute(this.geometry.mesh.faces.indices, 1))

        this.obj.geometry = bufferGeometry
    }
}
