import { ObjectId } from "mongodb";

export interface JWTPayload {
  username: string;
  role: string;
}

export interface User {
  _id?: ObjectId;
  username: string;
  password: string;
  superuser: boolean;
  acls?: ACL[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ACL {
  topic: string;
  acc: number; // 1=read, 2=write, 3=readwrite
}

export interface MQTTMessage {
  topic: string;
  payload: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}