import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

async function getRedisClient() {
 const client = createClient({
  password: process.env.redisPassword,
  socket: {
   host: process.env.redisHost,
   port: process.env.redisPort
  }
 });
 try {
  await client.connect(); 
  console.log('connected to redis client');
  await client.set('current', 1, { 'NX': true });
  await client.set('perProjectQuota', 0, { 'NX': true });
  return client;
 } catch (err) {
  console.log(err);
  process.exit(1);
 }
}

export default getRedisClient;
