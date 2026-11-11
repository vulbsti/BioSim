import * as T from 'three';
/** Objects on this layer are drawn once into an image with its depth, and drawn again only when marked stale. */
export const STILL=1;
/**
 * A cached picture of everything that does not move. Each frame copies it, with its depth, onto the canvas, and only
 * the moving and see-through objects are drawn over it, so an animated frame costs a fraction of the whole scene.
 * The image is tone mapped and colour encoded exactly as the canvas would be (three applies output encoding to XR
 * targets) and keeps the canvas's multisampling, so the copy matches a direct draw. Lights must be on both layers.
 */
export function createStillLayer(renderer:T.WebGLRenderer){
 const gl=renderer.getContext() as WebGL2RenderingContext,samples=gl.getParameter(gl.SAMPLES) as number,size=new T.Vector2();
 const material=new T.ShaderMaterial({uniforms:{colour:{value:null},depth:{value:null}},vertexShader:'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',fragmentShader:'uniform sampler2D colour; uniform sampler2D depth; void main(){ ivec2 at = ivec2(gl_FragCoord.xy); gl_FragColor = texelFetch(colour, at, 0); gl_FragDepth = texelFetch(depth, at, 0).r; }',depthFunc:T.AlwaysDepth,blending:T.NoBlending,toneMapped:false});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),material),copyScene=new T.Scene(),copyCamera=new T.Camera();quad.frustumCulled=false;copyScene.add(quad);
 let target:T.WebGLRenderTarget|null=null;
 const layer={
  stale:true,
  /** Call after every renderer.setSize or setPixelRatio. */
  resize(){
   renderer.getDrawingBufferSize(size);if(target&&target.width===size.x&&target.height===size.y)return;target?.depthTexture.dispose();target?.dispose();
   target=new T.WebGLRenderTarget(size.x,size.y,{samples,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthTexture:new T.DepthTexture(size.x,size.y,T.UnsignedIntType)});
   (target as T.WebGLRenderTarget&{isXRRenderTarget:boolean}).isXRRenderTarget=true;target.texture.colorSpace=T.SRGBColorSpace;target.texture.internalFormat='RGBA8';
   material.uniforms.colour.value=target.texture;material.uniforms.depth.value=target.depthTexture;layer.stale=true;
  },
  /** Draws the scene: still objects from the cache (redrawn first if stale), then the rest over them. */
  render(scene:T.Scene,camera:T.Camera){
   if(!target)layer.resize();
   const layers=camera.layers.mask;
   if(layer.stale){camera.layers.set(STILL);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);layer.stale=false;}
   camera.layers.mask=layers;camera.layers.disable(STILL);
   const autoClear=renderer.autoClear;renderer.render(copyScene,copyCamera);renderer.autoClear=false;renderer.render(scene,camera);renderer.autoClear=autoClear;camera.layers.mask=layers;
  },
  dispose(){quad.geometry.dispose();material.dispose();target?.depthTexture.dispose();target?.dispose();},
 };
 return layer;
}
/**
 * Spaces animated frames. Without a GPU, Chrome copies every WebGL frame back to the CPU and the page waits for it,
 * so a frame that takes 100 ms to draw blocks clicks and scrolling for 100 ms. The cost is read from how late the next
 * animation frame arrives, and animation waits at least twice that long, so at least half the time stays free for input.
 * With a GPU the cost reads near zero and only the frame-rate cap applies.
 */
export function createFramePacer(fps:number){
 let cost=0,last=-Infinity,measuring=false;
 return {
  /** Call once per animation frame; true when an animated frame may be drawn now. */
  ready(now:number){if(measuring){cost=cost*.7+Math.max(0,now-last-1000/60)*.3;measuring=false;}return now-last>=Math.max(1000/fps,cost*2);},
  drew(now:number){last=now;measuring=true;},
  get cost(){return cost;},
 };
}
