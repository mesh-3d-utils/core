import * as THREE from 'three'
import { Geometry, MeshGeometry } from './geometry.js';
import { TriangulateGeometryFunction } from './functions/triangulate.js';

export interface GeometryObject3D extends THREE.Mesh {
    geometry1?: Geometry
}

// Extend three.js event map so custom Object3D events are recognized by TS
declare module 'three' {
    interface Object3DEventMap {
        geometryUpdate: { type: 'geometryUpdate' }
        geometryChanged: { type: 'geometryChanged' }
        meshUpdate: { type: 'meshUpdate' }
        transformChange: { type: 'transformChange' }
    }
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
        this.obj.dispatchEvent({ type: 'geometryChanged' })
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
        
        obj.addEventListener('geometryUpdate', () => this.copyToObj3D())
    }

    update() {
        this.geometry.update()
        // dispatch obj geometryUpdate event
        this.obj.dispatchEvent({ type: 'geometryUpdate' })
    }

    copyToObj3D() {
        if (!(this.obj.geometry instanceof THREE.BufferGeometry))
            throw new Error('geometry is not a BufferGeometry');
    
        const geom = this.obj.geometry as THREE.BufferGeometry;
    
        const positions_x = this.geometry.mesh.vertices.x;
        const positions_y = this.geometry.mesh.vertices.y;
        const positions_z = this.geometry.mesh.vertices.z;
        const indices = this.geometry.mesh.faces.indices;
    
        const vertexCount = positions_x.length;
        const indexCount = indices.length;
    
        // Ensure position buffer exists and is large enough
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
        const requiredPosLen = vertexCount * 3;
    
        let posArray: Float32Array;
        if (!posAttr || posAttr.array.length < requiredPosLen) {
            // Allocate new, larger buffer
            posArray = new Float32Array(requiredPosLen);
            geom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        } else {
            posArray = posAttr.array as Float32Array;
        }
    
        // Fill position buffer
        for (let i = 0; i < vertexCount; i++) {
            const base = i * 3;
            posArray[base + 0] = positions_x[i]!;
            posArray[base + 1] = positions_y[i]!;
            posArray[base + 2] = positions_z[i]!;
        }
    
        geom.getAttribute('position').needsUpdate = true;
    
        // Ensure index buffer exists and is large enough
        const indexAttr = geom.getIndex() as THREE.BufferAttribute | null;
        const requiredIndexLen = indexCount;
    
        let indexArray: Uint32Array;
        if (!indexAttr || indexAttr.array.length < requiredIndexLen) {
            indexArray = new Uint32Array(requiredIndexLen);
            geom.setIndex(new THREE.BufferAttribute(indexArray, 1));
        } else {
            indexArray = indexAttr.array as Uint32Array;
        }
    
        // Fill index buffer
        indexArray.set(indices);
        geom.index!.needsUpdate = true;
    
        // Optional: adjust draw range if the count changed
        geom.setDrawRange(0, indexCount);
    
        // Optional: recompute bounding volumes if used
        geom.computeBoundingBox();
        geom.computeBoundingSphere();

        // notify listeners that mesh buffers were updated
        this.obj.dispatchEvent({ type: 'meshUpdate' })
    }
}
