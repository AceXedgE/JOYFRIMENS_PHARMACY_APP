import type {FastifyInstance} from 'fastify';
import fastifyStatic from '@fastify/static';

export async function registerFrontend(app:FastifyInstance,root:string){
 await app.register(fastifyStatic,{root,index:['index.html'],dotfiles:'deny'});
 app.setNotFoundHandler((request,reply)=>{
  const path=request.url.split('?')[0];
  if(request.method!=='GET'||path==='/api'||path.startsWith('/api/')||path.startsWith('/assets/')||path.split('/').some(part=>part.includes('.'))){
   return reply.code(404).send({message:'Not found.'});
  }
  return reply.sendFile('index.html');
 });
}
