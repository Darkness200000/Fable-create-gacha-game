import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
window.THREE = THREE; window.V3 = { GLTFLoader, VRMLoaderPlugin, VRMUtils };
