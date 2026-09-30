import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {designDocumentSchema, imageLayerSchema} from '@crescreendo/design-core/document'
import {resolveImagePlane} from '@crescreendo/design-core/image-plane'
import {mapDesignPoint} from '@crescreendo/design-core/transform'
import {designDocumentJsonSchema} from '@crescreendo/design-core/design-document-json-schema'
import {checkProject} from '../dist/project.js'
test('portable tilted example validates; pose is independent of replacement asset',async()=>{
 const dir=new URL('../examples/image-tilt/',import.meta.url).pathname
 assert.equal((await checkProject(dir)).ok,true)
 const raw=JSON.parse(await readFile(dir+'document.json','utf8')),doc=designDocumentSchema.parse(raw)
 const image=doc.frames[0].children.find(n=>n.id==='tilted-card')
 const pose=resolveImagePlane(image)
 assert.deepEqual(resolveImagePlane({...image,assetRef:'replacement-landscape'}),pose)
 for(const p of [{x:0,y:0},{x:image.frame.width,y:image.frame.height},{x:60,y:91}]){
  const back=mapDesignPoint(pose.inverse,mapDesignPoint(pose.transform,p));assert.ok(Math.abs(p.x-back.x)<1e-9&&Math.abs(p.y-back.y)<1e-9)
 }
 for(const rotationX of [-61,61,Infinity,NaN])assert.equal(imageLayerSchema.safeParse({...image,tilt:{rotationX,rotationY:0}}).success,false)
 const absent={...image};delete absent.tilt;assert.equal('tilt' in imageLayerSchema.parse(absent),false)
 assert.equal(imageLayerSchema.safeParse({...image,presentation:{kind:'linkedMagnifier',sourceLayerId:'flat-phone',sourceRect:{x:0,y:0,width:50,height:50}}}).success,false)
 const schema=JSON.stringify(designDocumentJsonSchema());assert.match(schema,/rotationX/);assert.match(schema,/"maximum":60/);assert.match(schema,/"not":\{"required":\["tilt"\]\}/)
})

test('distributed JSON Schema matches the pinned runtime emitter',async()=>{
 const path=new URL('../schema/design-document.schema.json',import.meta.resolve('@crescreendo/design-core/document'))
 const stored=JSON.parse(await readFile(path,'utf8'))
 assert.deepEqual(stored,designDocumentJsonSchema())
})
