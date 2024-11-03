import { createClient } from "redis";
import mongoose from "mongoose";

class DB {
  constructor() {
    this.uri = "mongodb://0.0.0.0:27017/trustxchange";
  }

  async run() {
    try {
      await mongoose.connect(this.uri, {
        autoIndex: true,
      });

      console.log("Successfully connected to MongoDB!");
    } catch (error) {
      console.error(error);
    }
  }
}


class RedisClient {
  client;

  constructor() {
    this.client = createClient({ url: `redis://localhost:6379` });

    this.client.on("error", (err) => {
      console.error("Redis client failed to connect:", err);
    });
  }

  async run() {
    try {
      await this.client.connect();
      console.log("Successfully connected to Redis!");
    } catch (err) {
      console.error("Redis client failed to connect:", err);
    }
  }

  set(key, value, exp) {
    return this.client.SETEX(key, exp, value);
  }

  get(key) {
    return this.client.GET(key);
  }

  del(key) {
    return this.client.DEL(key);
  }

  hset(key, field, value) {
    this.client.HSET(key, field, value);
  }

  hget(key, field) {
    return this.client.HGET(key, field);
  }

  hdel(key, field) {
    return this.client.HDEL(key, field);
  }

  async setArray(key, value, exp) {
    const cache = await this.get(key);

    if (!cache) {
      this.set(key, JSON.stringify([value]), exp);
    } else {
      const parse = JSON.parse(cache);
      parse.push(value);
      this.set(key, JSON.stringify(parse), exp);
    }
  }

  async getArray(key) {
    const cache = await this.get(key);

    return JSON.parse(cache);
  }

  async delArray(key, value) {
    let arr = await this.getArray(key);

    if (!arr || arr.length < 1) {
      await this.del(key);
      return;
    }

    arr = arr.filter(x => {
      console.log('del', x, x === value);
      return x !== value
    });


    await this.set(key, JSON.stringify(arr), 24 * 60 * 60)
  }

  hgetall(key) {
    return this.client.HGETALL(key);
  }
}

export const redisDB = new RedisClient();
export const mongoDB = new DB();