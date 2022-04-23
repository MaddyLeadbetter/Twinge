let faceapi;
let img;
let detections;
let faceToSwap = null

const vert = `
precision mediump float;

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
uniform vec2 uSize;

varying vec2 vTexCoord;
varying float vAlpha;
varying vec2 vBeneathCoord;

void main(void) {

  vec4 viewModelPosition = uModelViewMatrix * vec4(
    aPosition.x,
    aPosition.y,
    0.0,
    1.0
  );

  // Pass varyings to fragment shader
  gl_Position = uProjectionMatrix * viewModelPosition;  
  vBeneathCoord = gl_Position.xy / (gl_Position.w * 2.) + 0.5;
  vBeneathCoord.y = 1. - vBeneathCoord.y;

  vTexCoord = aTexCoord / uSize;
  vAlpha = aPosition.z;
}
`

const frag = `
precision mediump float;

uniform sampler2D uImg;
uniform sampler2D uBelow;

varying vec2 vTexCoord;
varying float vAlpha;
varying vec2 vBeneathCoord;

void main(void) {
  gl_FragColor = vec4(mix(
    texture2D(uBelow, vBeneathCoord).xyz,
    texture2D(uImg, vTexCoord).xyz,
    vAlpha
  ), 1.);
}
`

let alphaShader
let canvas
function setup() {
  canvas = createCanvas(640, 480, WEBGL)
  pixelDensity(1)
  canvas.hide()

  alphaShader = createShader(vert, frag)

  faceapi = ml5.faceApi({
    withLandmarks: true,
    withDescriptors: false,
  }, onModelReady);
  noLoop()
}

function onFileSelected(imgTag, cb) {
  const newImg = loadImage(imgTag.src, () => {
    img = newImg
    faceToSwap = null
    faceapi.detect(img, (err, result) => {
      if (err) {
        console.log(err);
        return;
      }

      detections = result;
      resizeCanvas(img.width, img.height)
      cb(detections)
    })
  })
}

function replaceFaces(i, cb) {
  faceToSwap = i
  redraw()
  cb(canvas.elt.toDataURL())
}

function draw() {
  push()
  clear()
  translate(-width/2, -height/2)

  if (img) {
    image(img, 0, 0)
  }
  if (detections && faceToSwap !== null) {
    for (let i = 0; i < detections.length; i++) {
      if (i === faceToSwap) continue
      swapFaces(detections[i], detections[faceToSwap])
    }
  }
  pop()
}

function swapFaces(vertsFace, uvsFace) {
  push()
  noStroke()
  textureMode(NORMAL)
  shader(alphaShader)
  alphaShader.setUniform('uImg', img)
  alphaShader.setUniform('uBelow', canvas)
  alphaShader.setUniform('uSize', [img.width, img.height])

  const innerVerts = getFacePoints(vertsFace, 0)
  const innerUvs = getFacePoints(uvsFace, 0)
  const outerVerts = getFacePoints(vertsFace, dilationAmount(vertsFace))
  const outerUvs = getFacePoints(uvsFace, dilationAmount(vertsFace))

  beginShape(TRIANGLE_FAN)
  innerVerts.forEach(({ x, y }, i) => {
    const { x: u, y: v } = innerUvs[i]
    vertex(x, y, 1, u, v)
  })
  endShape()

  beginShape(TRIANGLE_STRIP)
  for (let i = 1; i < innerVerts.length; i++) {
    vertex(innerVerts[i].x, innerVerts[i].y, 1, innerUvs[i].x, innerUvs[i].y)
    vertex(outerVerts[i].x, outerVerts[i].y, 0, outerUvs[i].x, outerUvs[i].y)
  }
  vertex(innerVerts[1].x, innerVerts[1].y, 1, innerUvs[1].x, innerUvs[1].y)
  vertex(outerVerts[1].x, outerVerts[1].y, 0, outerUvs[1].x, outerUvs[1].y)
  endShape()
  pop()
}

function dilationAmount(face) {
  const { _width, _height } = face.alignedRect._box
  const scale = Math.hypot(_width, _height)
  return scale / 30
}

function getFacePoints(face, dilateAmount = 0) {
  const points = []
  const { jawOutline, nose } = face.parts

  const center = createVector(nose[3]._x, nose[3]._y)

  // Jaw line
  const jawPoints = jawOutline.map(
    ({ _x, _y }, i) => createVector(_x, _y),
  )

  const endTangent = jawPoints[jawPoints.length - 1]
    .copy()
    .sub(jawPoints[jawPoints.length - 2])
  const startTangent = jawPoints[0]
    .copy()
    .sub(jawPoints[1])

    const leftTop = jawPoints[jawPoints.length - 1]
      .copy()
      .add(endTangent.copy().mult(1.5))
    const rightTop = jawPoints[0]
      .copy()
      .add(startTangent.copy().mult(1.5))
    const topCenter = jawPoints[jawPoints.length - 1]
      .copy()
      .add(endTangent.copy().mult(3))
      .add(jawPoints[0])
      .add(startTangent.copy().mult(3))
      .mult(0.5)

    points.push(...jawPoints)
    points.push(leftTop)
    points.push(topCenter)
    points.push(rightTop)

  // Connect back to the start
  points.push(points[0])

  const dilated = dilate(points, center, dilateAmount)
  return [center, ...dilated]
}

function dilate(points, center, amount) {
  return points.map(
    (p) => p
      .copy()
      .add(p.copy().sub(center).normalize().mult(amount)),
  )
}

function poseNetReady() {
  poseNet.singlePose(video);
}

function onModelReady() {
  console.log('model ready')
}

function drawFace() {
  if (detections && detections.length > 0) {
    drawBox(detections);
    drawLandmarks(detections);
  }
}

function drawBox(detections) {
  for (let i = 0; i < detections.length; i++) {
    const alignedRect = detections[i].alignedRect;
    const x = alignedRect._box._x;
    const y = alignedRect._box._y;
    const boxWidth = alignedRect._box._width;
    const boxHeight = alignedRect._box._height;

    noFill();
    stroke(161, 95, 251);
    strokeWeight(2);
    rect(x, y, boxWidth, boxHeight);
  }
}
