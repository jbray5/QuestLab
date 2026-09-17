import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import type { MapDef } from "./maps";

/**
 * Where the props come from (Plan 108).
 *
 * Poly Haven photoscans — CC0, real materials — loaded from their CDN for the
 * spike the way the placeholder character is. Milestone 4 hosts them ourselves.
 */
const CDN = "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k";

/** The glTF for a Poly Haven model, by its id. */
export const modelUrl = (name: string) => `${CDN}/${name}/${name}_1k.gltf`;

// Poly Haven's glTFs reference `textures/x.jpg` beside the model, but the CDN
// keeps the JPEGs in a separate tree (Models/jpg/1k/<model>/x.jpg). Without
// this every prop loads untextured and silently flat. Scoped to that one host
// and path shape, so nothing else the app loads is touched.
const PH_TEXTURE = /^(https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Models)\/gltf\/\dk\/([^/]+)\/textures\/(.+)$/;
THREE.DefaultLoadingManager.setURLModifier((u) => u.replace(PH_TEXTURE, "$1/jpg/1k/$2/$3"));

/** Start fetching a map's models before they are asked for. */
export function preloadProps(map: MapDef): void {
  for (const name of new Set(map.props.map((p) => p.model))) {
    if (name !== "papers") useGLTF.preload(modelUrl(name));
  }
}
