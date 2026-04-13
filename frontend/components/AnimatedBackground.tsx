"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Shared Three.js animated background — same shader used on the dashboard.
 * Drop this anywhere; it renders into a fixed full-screen canvas at z-index 0.
 */
export default function AnimatedBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isChrome = /Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua);
    const isLowPower = isMobile || (navigator.hardwareConcurrency || 4) <= 4;
    const dprCap = isMobile ? 1.25 : isChrome ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile && !isLowPower,
      alpha: true,
      powerPreference: isMobile ? "default" : "high-performance",
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const canvas = renderer.domElement;
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:0;display:block;border:0;outline:0;";
    mount.innerHTML = "";
    mount.appendChild(canvas);

    const uniforms = {
      uTime:             { value: 0.0 },
      uResolution:       { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uActualResolution: { value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) },
      uMouse:            { value: new THREE.Vector2(0.5, 0.5) },
      uCount:            { value: isMobile ? 4 : isChrome ? 5 : 7 },
      uSmooth:           { value: 0.55 },
      uSpeed:            { value: 0.62 },
      uContrast:         { value: 1.7 },
      uFog:              { value: 0.14 },
      uBg:               { value: new THREE.Color(0x07070b) },
      uLight:            { value: new THREE.Color(0x5fe3ff) },
      uLight2:           { value: new THREE.Color(0x5aa8ff) },
      uIsSafari:         { value: isSafari  ? 1.0 : 0.0 },
      uIsLowPower:       { value: isLowPower ? 1.0 : 0.0 },
      uIsChrome:         { value: isChrome  ? 1.0 : 0.0 },
    };

    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        ${isMobile || isLowPower ? "precision mediump float;" : "precision highp float;"}
        uniform float uTime; uniform vec2 uResolution,uActualResolution,uMouse;
        uniform int uCount; uniform float uSmooth,uSpeed,uContrast,uFog;
        uniform vec3 uBg,uLight,uLight2;
        uniform float uIsSafari,uIsLowPower,uIsChrome;
        const float PI=3.14159265359,EPS=0.001;
        float smin(float a,float b,float k){float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*0.25;}
        float sdSphere(vec3 p,float r){return length(p)-r;}
        vec3 s2w(vec2 n){vec2 u=n*2.0-1.0;u.x*=uResolution.x/uResolution.y;return vec3(u*2.0,0.0);}
        float sceneSDF(vec3 p){
          float d=100.0;
          d=smin(d,sdSphere(p-s2w(vec2(0.10,0.86)),0.85),0.35);
          d=smin(d,sdSphere(p-s2w(vec2(0.90,0.14)),0.95),0.35);
          float t=uTime*uSpeed;
          int mx=(uIsLowPower>0.5)?4:(uIsSafari>0.5?5:8);
          for(int i=0;i<10;i++){
            if(i>=uCount||i>=mx)break;
            float fi=float(i),speed=0.42+fi*0.12,rad=0.12+mod(fi,3.0)*0.06,orbit=0.36+mod(fi,3.0)*0.18,ph=fi*PI*0.35;
            vec3 o=vec3(sin(t*speed+ph)*orbit*0.85,cos(t*speed*0.85+ph*1.3)*orbit*0.60,sin(t*speed*0.5+ph)*0.35);
            vec3 cursor=s2w(uMouse),toC=cursor-o;float cd=length(toC);
            if(cd<1.65&&cd>0.0)o+=normalize(toC)*(1.0-cd/1.65)*0.22;
            d=smin(d,sdSphere(p-o,rad),uSmooth);
          }
          d=smin(d,sdSphere(p-s2w(uMouse),0.11),uSmooth);
          return d;
        }
        vec3 calcNormal(vec3 p){float e=(uIsLowPower>0.5)?0.002:0.001;return normalize(vec3(sceneSDF(p+vec3(e,0,0))-sceneSDF(p-vec3(e,0,0)),sceneSDF(p+vec3(0,e,0))-sceneSDF(p-vec3(0,e,0)),sceneSDF(p+vec3(0,0,e))-sceneSDF(p-vec3(0,0,e))));}
        float rayMarch(vec3 ro,vec3 rd){
          float t=0.0;int steps=(uIsLowPower>0.5)?16:((uIsSafari>0.5)?20:((uIsChrome>0.5)?30:40));
          for(int i=0;i<64;i++){if(i>=steps)break;vec3 p=ro+rd*t;float d=sceneSDF(p);if(d<EPS)return t;if(t>5.0)break;t+=d*(uIsLowPower>0.5?1.18:0.92);}
          return -1.0;
        }
        void main(){
          vec2 uv=(gl_FragCoord.xy*2.0-uActualResolution.xy)/uActualResolution.xy;
          uv.x*=uResolution.x/uResolution.y;
          float uMood=0.42+0.38*sin(uTime*0.12),uPulse=0.38+0.33*sin(uTime*0.31);
          vec3 ro=vec3(uv*2.0,-1.0),rd=vec3(0,0,1);
          float t=rayMarch(ro,rd);vec3 col=uBg;
          if(t>0.0){
            vec3 p=ro+rd*t,n=calcNormal(p),ld=normalize(vec3(0.7,1.0,0.6)),ld2=normalize(vec3(-0.6,0.4,0.7));
            float diff=max(dot(n,ld),0.0),diff2=max(dot(n,ld2),0.0),NoV=max(dot(n,-rd),0.0),fres=pow(1.0-NoV,1.35);
            vec3 base=vec3(0.02,0.04,0.07),vd=-rd,hd=normalize(ld+vd);
            float specPow=32.0+36.0*uMood+42.0*uPulse,spec=pow(max(dot(n,hd),0.0),specPow)*(0.20+0.30*uMood+0.38*uPulse);
            vec3 specCol=mix(uLight2,uLight,0.65)*spec;
            vec3 glow=mix(uLight2,uLight,0.55)*(diff*(0.82+0.28*uMood)+diff2*(0.22+0.16*uMood)+fres*(0.58+0.30*uMood));
            float rim=pow(1.0-NoV,2.6)*(0.18+0.22*uMood+0.26*uPulse);
            vec3 rimCol=mix(uLight,uLight2,0.35)*rim,env=vec3(0.018,0.025,0.045)*pow(fres,1.5)*(0.26+0.14*uPulse);
            col=base+glow+env+rimCol+specCol;
            col=pow(col,vec3(uContrast));col=col/(col+vec3(0.85));
            float fogAmt=1.0-exp(-t*uFog);col=mix(col,uBg,fogAmt*0.62);
            float luma=dot(col,vec3(0.2126,0.7152,0.0722));
            col+=(col*col)*(0.045+0.035*uMood+0.030*uPulse);
            col+=mix(vec3(0.0),mix(uLight2,uLight,0.5),smoothstep(0.55,1.05,luma))*(0.05*uMood+0.06*uPulse);
          }
          float r=length(uv),vig=smoothstep(1.10,0.20,r);col*=mix(0.84,1.06,vig);
          vec3 chroma=vec3(0.012,-0.006,0.010)*(0.35+0.45*uMood+0.60*uPulse);
          col=clamp(col+chroma*(1.0-vig),0.0,1.0);
          float g=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
          col+=(g-0.5)*(0.010+0.006*uMood);
          gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
        }
      `,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    const clock = new THREE.Clock();
    const mouseTarget = new THREE.Vector2(0.5, 0.5);

    const onMouseMove = (e: MouseEvent) => {
      mouseTarget.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      uniforms.uResolution.value.set(w, h);
      uniforms.uActualResolution.value.set(w * dpr, h * dpr);
    };
    window.addEventListener("resize", onResize, { passive: true });

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      uniforms.uTime.value += dt;
      uniforms.uMouse.value.lerp(mouseTarget, 0.06);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      material.dispose();
      plane.geometry.dispose();
      if (mount.contains(canvas)) mount.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} style={{ position: "fixed", inset: 0, zIndex: 0 }} aria-hidden="true" />;
}
