import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage, detectSector, seed, hashPassword, verifyPassword } from "./storage";
import { sendInviteEmail, sendInstallerProfileReminderEmail, sendInstallerFicheLinkEmail, sendRepresentativeFicheLinkEmail, sendLeadAssignedEmail, sendInstallerAssignedEmail, sendOverdueInstallAlert } from "./email";
import { sendInviteSms, sendInstallerProfileReminderSms, sendSatisfactionSms } from "./sms";
import { insertLeadSchema, insertQuoteSchema, insertActivitySchema, insertUserSchema, insertCrewSchema, insertInstallerApplicationSchema, insertRepresentativeApplicationSchema } from "@shared/schema";
import { buildBookmarkletLoaderHref, buildIntimuraBookmarkletRunner } from "./intimura-bookmarklet-runner";

function decodeSvelteData(data: any[]) {
  // Cycle/depth-protected resolver. Some Svelte payloads contain self-referential
  // index pointers that would otherwise overflow the stack.
  const cache = new Map<number, any>();
  const decode = (value: any, depth = 0): any => {
    if (depth > 200) return value;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < data.length) {
      if (cache.has(value)) return cache.get(value);
      const placeholder: any = {};
      cache.set(value, placeholder);
      const resolved = decode(data[value], depth + 1);
      cache.set(value, resolved);
      return resolved;
    }
    if (Array.isArray(value)) {
      if (value[0] === "Date") return value[1];
      return value.map((v) => decode(v, depth + 1));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v, depth + 1)]));
    }
    return value;
  };
  return decode(data[0]);
}

function extractCity(title = "") {
  const parts = title.split(/\s+x\s+/i).map(p => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function inferProvince(city = "") {
  const c = city.toLowerCase();
  if (["moncton"].some(v => c.includes(v))) return "NB";
  if (["toronto", "ottawa", "mississauga", "cantley"].some(v => c.includes(v))) return c.includes("cantley") ? "QC" : "ON";
  if (["calgary", "edmonton"].some(v => c.includes(v))) return "AB";
  if (["vancouver"].some(v => c.includes(v))) return "BC";
  return "QC";
}

function mapIntimuraStatus(status = "") {
  if (status === "approved") return "signee";
  if (status === "snoozed") return "suivi";
  if (status === "sent") return "envoyee";
  return "nouveau";
}

type ApiCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const apiResponseCache = new Map<string, ApiCacheEntry>();
const API_CACHE_TTL_MS = 15_000;

function getApiCacheKey(req: Request) {
  const actor = req.user as any;
  const role = actor?.role || "anonymous";
  const uid = actor?.id ?? "anon";
  return `${req.method}:${req.originalUrl}:role=${role}:uid=${uid}`;
}

function getCachedApiResponse<T>(req: Request): T | null {
  const key = getApiCacheKey(req);
  const cached = apiResponseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    apiResponseCache.delete(key);
    return null;
  }
  return cached.payload as T;
}

function setCachedApiResponse(req: Request, payload: unknown, ttlMs = API_CACHE_TTL_MS) {
  apiResponseCache.set(getApiCacheKey(req), {
    payload,
    expiresAt: Date.now() + ttlMs,
  });
}

function clearApiResponseCache() {
  apiResponseCache.clear();
}

// Built-in FSA (first 3 chars of Canadian postal code) coordinate lookup.
// Covers all major Quebec, Ontario, Alberta and BC forward sortation areas.
// This replaces the previous Nominatim call which was unreliable.
const FSA_COORDS_SERVER: Record<string, [number, number]> = {
  // ── Montréal (H) ───────────────────────────────────────────────────────────
  H1A:[45.61,-73.52],H1B:[45.60,-73.49],H1C:[45.60,-73.50],H1E:[45.64,-73.53],
  H1G:[45.62,-73.57],H1H:[45.60,-73.60],H1J:[45.60,-73.62],H1K:[45.62,-73.64],
  H1L:[45.57,-73.55],H1M:[45.57,-73.53],H1N:[45.56,-73.58],H1P:[45.59,-73.65],
  H1R:[45.58,-73.66],H1S:[45.55,-73.58],H1T:[45.56,-73.57],H1V:[45.55,-73.56],
  H1W:[45.53,-73.55],H1X:[45.56,-73.61],H1Y:[45.55,-73.57],H1Z:[45.56,-73.63],
  H2A:[45.57,-73.60],H2B:[45.57,-73.67],H2C:[45.56,-73.65],H2E:[45.55,-73.64],
  H2G:[45.54,-73.60],H2H:[45.53,-73.58],H2J:[45.52,-73.58],H2K:[45.52,-73.56],
  H2L:[45.52,-73.57],H2M:[45.55,-73.66],H2N:[45.54,-73.65],H2P:[45.54,-73.62],
  H2R:[45.53,-73.63],H2S:[45.53,-73.62],H2T:[45.52,-73.59],H2V:[45.52,-73.60],
  H2W:[45.51,-73.58],H2X:[45.51,-73.57],H2Y:[45.50,-73.56],H2Z:[45.50,-73.56],
  H3A:[45.51,-73.58],H3B:[45.50,-73.57],H3C:[45.49,-73.55],H3E:[45.49,-73.54],
  H3G:[45.50,-73.58],H3H:[45.49,-73.59],H3J:[45.48,-73.58],H3K:[45.48,-73.59],
  H3L:[45.53,-73.67],H3M:[45.53,-73.68],H3N:[45.52,-73.65],H3P:[45.50,-73.63],
  H3R:[45.49,-73.63],H3S:[45.49,-73.62],H3T:[45.49,-73.60],H3V:[45.49,-73.61],
  H3W:[45.49,-73.61],H3X:[45.48,-73.60],H3Y:[45.47,-73.60],H3Z:[45.47,-73.59],
  H4A:[45.47,-73.60],H4B:[45.46,-73.61],H4C:[45.47,-73.57],H4E:[45.46,-73.56],
  H4G:[45.46,-73.57],H4H:[45.46,-73.58],H4J:[45.48,-73.67],H4K:[45.48,-73.68],
  H4L:[45.50,-73.69],H4M:[45.51,-73.69],H4N:[45.50,-73.70],H4P:[45.49,-73.64],
  H4R:[45.50,-73.74],H4S:[45.50,-73.75],H4T:[45.48,-73.65],H4V:[45.47,-73.61],
  H4W:[45.47,-73.62],H4X:[45.46,-73.62],H4Y:[45.46,-73.74],H4Z:[45.50,-73.57],
  H7A:[45.59,-73.71],H7B:[45.62,-73.74],H7C:[45.62,-73.72],H7E:[45.63,-73.71],
  H7G:[45.64,-73.72],H7H:[45.64,-73.70],H7J:[45.63,-73.69],H7K:[45.62,-73.76],
  H7L:[45.61,-73.76],H7M:[45.63,-73.68],H7N:[45.62,-73.66],H7P:[45.61,-73.80],
  H7R:[45.60,-73.79],H7S:[45.60,-73.80],H7T:[45.59,-73.77],H7V:[45.58,-73.77],
  H7W:[45.58,-73.75],H7X:[45.57,-73.76],H7Y:[45.56,-73.76],
  H8N:[45.47,-73.72],H8P:[45.47,-73.74],H8R:[45.45,-73.73],H8S:[45.45,-73.72],
  H8T:[45.46,-73.72],H8Y:[45.46,-73.81],H8Z:[45.47,-73.80],
  H9A:[45.46,-73.83],H9B:[45.47,-73.83],H9C:[45.46,-73.84],H9E:[45.44,-73.84],
  H9G:[45.44,-73.83],H9H:[45.43,-73.83],H9J:[45.44,-73.82],H9K:[45.43,-73.82],
  H9P:[45.44,-73.85],H9R:[45.45,-73.86],H9S:[45.44,-73.86],H9W:[45.43,-73.86],
  H9X:[45.43,-73.95],
  // ── Québec (G) ───────────────────────────────────────────────────────────
  G1A:[46.81,-71.21],G1B:[46.84,-71.14],G1C:[46.82,-71.16],G1E:[46.85,-71.21],
  G1G:[46.83,-71.26],G1H:[46.83,-71.25],G1J:[46.82,-71.26],G1K:[46.81,-71.22],
  G1L:[46.82,-71.24],G1M:[46.80,-71.23],G1N:[46.80,-71.29],G1P:[46.80,-71.33],
  G1R:[46.81,-71.22],G1S:[46.79,-71.28],G1T:[46.78,-71.29],G1V:[46.78,-71.29],
  G1W:[46.77,-71.31],G1X:[46.76,-71.31],G1Y:[46.75,-71.34],
  G2A:[46.85,-71.32],G2B:[46.86,-71.36],G2C:[46.87,-71.35],G2E:[46.82,-71.38],
  G2G:[46.83,-71.41],G2J:[46.85,-71.33],G2K:[46.85,-71.30],G2L:[46.86,-71.33],
  G2M:[46.87,-71.32],G2N:[46.86,-71.34],
  G3A:[46.91,-71.33],G3B:[46.93,-71.34],G3C:[46.92,-71.24],G3E:[46.87,-71.42],
  G3G:[46.93,-71.34],G3H:[46.72,-71.88],G3J:[46.95,-71.26],G3K:[46.93,-71.26],
  G3L:[46.91,-71.24],G3M:[46.85,-71.20],G3N:[46.91,-71.20],
  G4A:[47.40,-70.97],G4R:[48.81,-72.24],G4S:[48.43,-71.89],G4T:[48.08,-77.80],
  G4V:[48.29,-71.02],G4W:[49.52,-67.51],G4X:[48.40,-68.52],G4Z:[48.33,-70.87],
  G5A:[47.10,-70.56],G5B:[47.01,-70.88],G5C:[47.13,-70.51],G5H:[47.29,-70.43],
  G5J:[46.80,-70.94],G5L:[47.65,-69.89],G5M:[47.76,-69.72],G5N:[47.79,-70.28],
  G5R:[47.84,-69.52],G5T:[47.42,-69.96],G5V:[46.39,-72.57],G5X:[46.46,-72.28],
  G5Y:[46.30,-72.31],G5Z:[46.55,-72.75],
  G6A:[46.75,-71.43],G6B:[46.74,-71.44],G6C:[46.72,-71.45],G6E:[46.72,-71.43],
  G6G:[46.35,-72.58],G6H:[46.35,-72.55],G6J:[46.35,-72.53],G6K:[46.62,-71.47],
  G6L:[46.57,-71.73],G6P:[46.55,-72.01],G6R:[46.45,-72.69],G6S:[46.53,-72.70],
  G6T:[46.54,-72.78],G6V:[46.77,-71.28],G6W:[46.76,-71.26],G6X:[46.77,-71.23],
  G6Z:[46.78,-71.22],
  G7A:[48.43,-71.05],G7B:[48.43,-71.11],G7G:[48.42,-71.08],G7H:[48.41,-71.08],
  G7J:[48.40,-71.07],G7K:[48.39,-71.12],G7N:[48.38,-71.11],G7S:[48.73,-72.26],
  G7T:[48.75,-72.28],G7X:[48.82,-72.33],
  G8A:[46.56,-72.75],G8B:[48.08,-72.48],G8C:[46.54,-72.77],G8G:[47.13,-72.80],
  G8H:[47.11,-72.82],G8J:[47.46,-70.56],G8K:[47.65,-72.45],G8L:[47.88,-72.50],
  G8M:[48.58,-71.50],G8N:[48.63,-71.44],G8P:[47.35,-72.54],G8T:[48.43,-71.62],
  G8V:[48.72,-72.24],G8W:[48.75,-72.23],G8Y:[48.38,-71.08],
  G9A:[46.36,-72.60],G9B:[46.38,-72.60],G9C:[46.35,-72.56],G9H:[45.74,-74.00],
  G9N:[46.54,-72.55],G9T:[46.56,-72.51],G9X:[47.47,-74.00],
  // ── Laurentides / Montérégie (J) ──────────────────────────────────────────
  J0A:[45.60,-72.96],J0B:[45.21,-72.49],J0C:[45.70,-72.54],J0E:[45.52,-73.08],
  J0G:[46.25,-73.35],J0H:[45.48,-73.06],J0J:[45.03,-73.23],J0K:[46.00,-73.56],
  J0L:[45.30,-73.57],J0M:[45.23,-74.23],J0N:[45.86,-73.55],J0P:[45.78,-74.22],
  J0R:[45.90,-74.03],J0S:[45.17,-73.48],J0T:[46.10,-74.60],J0V:[46.40,-74.70],
  J0W:[47.00,-74.50],J0X:[46.10,-75.90],J0Y:[48.00,-77.80],J0Z:[47.40,-79.60],
  J1A:[45.33,-71.87],J1C:[45.37,-71.82],J1E:[45.38,-71.89],J1G:[45.40,-71.91],
  J1H:[45.40,-71.93],J1J:[45.39,-71.96],J1K:[45.41,-71.97],J1L:[45.37,-71.93],
  J1M:[45.35,-71.95],J1N:[45.35,-71.87],J1R:[45.29,-71.93],J1S:[45.28,-71.86],
  J1T:[45.29,-71.84],J1X:[45.30,-71.79],J1Z:[45.39,-71.82],
  J2A:[45.40,-72.73],J2B:[45.38,-72.73],J2C:[45.39,-72.75],J2E:[45.40,-72.76],
  J2G:[45.39,-72.77],J2H:[45.39,-72.78],J2J:[45.55,-72.46],J2K:[45.43,-72.99],
  J2L:[45.51,-72.55],J2N:[45.45,-72.97],J2R:[45.40,-73.24],J2S:[45.41,-73.01],
  J2T:[45.41,-73.00],J2W:[45.41,-73.01],J2X:[45.45,-72.96],
  J3A:[45.52,-73.34],J3B:[45.50,-73.34],J3E:[45.49,-73.33],J3G:[45.51,-73.49],
  J3H:[45.52,-73.43],J3L:[45.42,-73.45],J3M:[45.41,-73.01],J3N:[45.42,-73.47],
  J3P:[45.42,-73.46],J3R:[45.52,-73.47],J3T:[45.41,-73.48],J3V:[45.43,-73.48],
  J3X:[45.42,-73.46],J3Y:[45.41,-73.49],J3Z:[45.42,-73.49],
  J4A:[45.52,-73.25],J4B:[45.51,-73.25],J4G:[45.52,-73.28],J4H:[45.51,-73.28],
  J4J:[45.52,-73.30],J4K:[45.47,-73.27],J4L:[45.46,-73.27],J4M:[45.48,-73.27],
  J4N:[45.50,-73.26],J4P:[45.51,-73.24],J4R:[45.52,-73.23],J4S:[45.47,-73.27],
  J4T:[45.48,-73.28],J4V:[45.49,-73.28],J4W:[45.49,-73.27],J4X:[45.50,-73.27],
  J4Y:[45.50,-73.25],J4Z:[45.51,-73.24],
  J5A:[45.89,-73.26],J5B:[45.89,-73.27],J5C:[45.90,-73.25],J5J:[45.75,-73.18],
  J5K:[45.85,-73.30],J5L:[45.86,-73.29],J5M:[45.82,-73.31],J5R:[45.79,-73.35],
  J5T:[45.71,-73.15],J5V:[46.22,-73.55],J5W:[45.60,-73.37],J5X:[45.75,-73.40],
  J5Y:[45.77,-73.39],J5Z:[45.79,-73.37],
  J6A:[45.31,-73.27],J6E:[45.56,-74.08],J6J:[45.44,-73.89],J6K:[45.50,-74.06],
  J6N:[45.41,-73.87],J6R:[45.44,-73.86],J6S:[45.45,-73.87],J6T:[45.43,-73.87],
  J6V:[45.56,-74.10],J6W:[45.58,-74.10],J6X:[45.71,-74.02],J6Y:[45.72,-74.01],
  J6Z:[45.71,-74.03],
  J7A:[45.76,-74.00],J7B:[45.77,-74.01],J7C:[45.79,-74.01],J7E:[45.78,-73.99],
  J7G:[45.77,-74.04],J7H:[45.81,-74.05],J7J:[45.77,-74.11],J7K:[45.77,-74.12],
  J7L:[45.73,-74.01],J7M:[45.74,-74.01],J7N:[45.75,-74.01],J7P:[45.72,-74.05],
  J7R:[45.74,-74.05],J7T:[45.76,-74.12],J7V:[45.47,-74.51],J7W:[45.50,-74.48],
  J7X:[45.52,-74.46],J7Y:[45.53,-74.44],J7Z:[45.54,-74.42],
  J8A:[45.50,-75.78],J8B:[45.50,-75.68],J8C:[45.50,-75.62],J8E:[45.79,-75.54],
  J8G:[45.64,-75.65],J8H:[45.57,-75.31],J8L:[45.75,-75.44],J8M:[45.90,-75.23],
  J8N:[45.76,-75.38],J8P:[45.47,-75.68],J8R:[45.47,-75.65],J8T:[45.48,-75.69],
  J8V:[45.47,-75.70],J8X:[45.79,-75.54],J8Y:[45.82,-75.18],J8Z:[45.46,-75.73],
  J9A:[45.27,-78.16],J9B:[45.29,-77.24],J9E:[45.79,-77.11],J9H:[45.45,-75.75],
  J9J:[45.44,-75.77],J9L:[46.07,-74.59],J9P:[48.10,-77.79],J9T:[47.32,-79.43],
  J9V:[47.64,-79.19],J9X:[48.25,-79.03],J9Y:[48.78,-79.68],J9Z:[48.60,-79.41],
  // ── Ottawa-Gatineau (K) ───────────────────────────────────────────────────
  K1A:[45.42,-75.70],K1B:[45.43,-75.64],K1C:[45.44,-75.60],K1E:[45.45,-75.58],
  K1G:[45.41,-75.64],K1H:[45.40,-75.66],K1J:[45.43,-75.66],K1K:[45.43,-75.67],
  K1L:[45.43,-75.68],K1M:[45.43,-75.70],K1N:[45.43,-75.70],K1P:[45.42,-75.70],
  K1R:[45.41,-75.70],K1S:[45.40,-75.67],K1T:[45.39,-75.68],K1V:[45.38,-75.69],
  K1W:[45.42,-75.62],K1X:[45.41,-75.58],K1Y:[45.42,-75.72],K1Z:[45.42,-75.73],
  K2A:[45.42,-75.75],K2B:[45.42,-75.78],K2C:[45.38,-75.74],K2E:[45.37,-75.74],
  K2G:[45.36,-75.77],K2H:[45.36,-75.80],K2J:[45.33,-75.78],K2K:[45.33,-75.83],
  K2L:[45.36,-75.82],K2M:[45.36,-75.83],K2P:[45.41,-75.71],K2R:[45.32,-75.78],
  K2S:[45.33,-75.85],K2T:[45.35,-75.84],K2V:[45.35,-75.85],K2W:[45.37,-75.85],
  K4A:[45.43,-75.44],K4B:[45.41,-75.42],K4C:[45.46,-75.44],K4K:[45.49,-75.39],
  K4M:[45.39,-75.43],K4P:[45.36,-75.45],K4R:[45.44,-75.53],K4S:[44.93,-76.23],
  K4T:[45.12,-75.20],K4V:[45.15,-75.16],
  // ── Ontario (L/M/N) ───────────────────────────────────────────────────────
  L0A:[44.27,-78.88],L0B:[44.11,-79.10],L0C:[44.10,-79.36],L0E:[44.23,-79.32],
  L0G:[44.22,-79.51],L0H:[44.12,-79.55],L0J:[43.82,-79.52],L0K:[44.50,-79.69],
  L0L:[44.60,-79.67],L0M:[44.61,-79.68],L0N:[43.66,-80.00],L0P:[43.74,-80.24],
  L0R:[43.24,-79.88],L0S:[43.17,-79.17],L1A:[44.02,-78.17],L1B:[44.00,-78.17],
  L1C:[44.00,-78.18],L1E:[44.01,-78.18],L1G:[44.02,-78.19],L1H:[43.90,-78.85],
  L1J:[43.89,-78.86],L1K:[43.93,-78.88],L1L:[43.92,-78.87],L1M:[43.94,-78.88],
  L1N:[43.91,-78.88],L1P:[43.92,-78.87],L1R:[43.90,-78.88],L1S:[43.86,-79.08],
  L1T:[43.86,-79.08],L1V:[43.84,-79.08],L1W:[43.84,-79.08],L1X:[43.85,-79.08],
  L1Y:[43.85,-79.10],L1Z:[43.84,-79.10],
  L2A:[42.90,-79.24],L2E:[43.09,-79.09],L2G:[43.07,-79.09],L2H:[43.08,-79.09],
  L2J:[43.15,-79.07],L2M:[43.17,-79.23],L2N:[43.18,-79.25],L2P:[43.16,-79.25],
  L2R:[43.17,-79.24],L2S:[43.16,-79.23],L2T:[43.14,-79.22],L2V:[43.13,-79.22],
  L2W:[43.12,-79.22],L3A:[43.61,-79.43],L3B:[43.34,-79.81],L3C:[43.35,-79.82],
  L3M:[43.58,-79.56],L3P:[43.87,-79.26],L3R:[43.84,-79.33],L3S:[43.84,-79.29],
  L3T:[43.80,-79.39],L3V:[44.59,-79.42],L3X:[44.07,-79.50],L3Y:[44.08,-79.48],
  L3Z:[44.09,-79.46],
  L4A:[44.03,-79.50],L4B:[43.84,-79.41],L4C:[43.86,-79.44],L4E:[43.92,-79.49],
  L4G:[43.95,-79.52],L4H:[43.83,-79.52],L4J:[43.80,-79.48],L4K:[43.80,-79.52],
  L4L:[43.80,-79.53],L4M:[44.39,-79.69],L4N:[44.38,-79.69],L4P:[44.34,-79.38],
  L4R:[44.73,-79.74],L4S:[43.89,-79.44],L4T:[43.72,-79.62],L4V:[43.73,-79.64],
  L4W:[43.72,-79.64],L4X:[43.72,-79.64],L4Y:[43.70,-79.61],L4Z:[43.71,-79.60],
  L5A:[43.63,-79.60],L5B:[43.61,-79.61],L5C:[43.61,-79.59],L5E:[43.55,-79.60],
  L5G:[43.55,-79.59],L5H:[43.54,-79.59],L5J:[43.53,-79.55],L5K:[43.52,-79.55],
  L5L:[43.54,-79.68],L5M:[43.56,-79.72],L5N:[43.58,-79.74],L5P:[43.65,-79.65],
  L5R:[43.65,-79.66],L5S:[43.68,-79.65],L5T:[43.68,-79.64],L5V:[43.65,-79.68],
  L5W:[43.64,-79.75],L6A:[43.83,-79.54],L6B:[43.87,-79.57],L6C:[43.86,-79.57],
  L6E:[43.87,-79.57],L6G:[43.88,-79.55],L6H:[43.47,-79.71],L6J:[43.47,-79.68],
  L6K:[43.46,-79.68],L6L:[43.45,-79.70],L6M:[43.44,-79.73],L6P:[43.74,-79.73],
  L6R:[43.76,-79.75],L6S:[43.74,-79.73],L6T:[43.72,-79.73],L6V:[43.69,-79.73],
  L6W:[43.69,-79.72],L6X:[43.69,-79.73],L6Y:[43.69,-79.72],L6Z:[43.70,-79.72],
  L7A:[43.67,-79.86],L7B:[44.06,-79.43],L7C:[43.95,-79.86],L7E:[43.80,-79.77],
  L7G:[43.80,-79.67],L7J:[43.64,-80.07],L7K:[43.71,-80.03],L7L:[43.36,-79.77],
  L7M:[43.36,-79.77],L7N:[43.35,-79.76],L7P:[43.35,-79.77],L7R:[43.35,-79.79],
  L7S:[43.35,-79.80],L7T:[43.36,-79.80],L8E:[43.19,-79.83],L8G:[43.21,-79.82],
  L8H:[43.25,-79.82],L8J:[43.22,-79.82],L8K:[43.23,-79.82],L8L:[43.26,-79.83],
  L8M:[43.25,-79.83],L8N:[43.25,-79.86],L8P:[43.25,-79.87],L8R:[43.26,-79.87],
  L8S:[43.26,-79.87],L8T:[43.23,-79.84],L8V:[43.22,-79.83],L8W:[43.22,-79.83],
  L9A:[43.25,-79.89],L9B:[43.24,-79.89],L9C:[43.24,-79.88],L9G:[43.22,-79.93],
  L9H:[43.26,-79.92],L9J:[43.83,-79.52],L9K:[43.24,-79.91],L9L:[44.12,-79.53],
  L9M:[44.57,-79.81],L9N:[44.32,-79.60],L9P:[44.07,-79.29],L9R:[44.15,-79.64],
  L9S:[44.16,-79.65],L9T:[43.50,-79.89],L9V:[44.31,-80.29],L9W:[43.82,-80.12],
  L9Y:[44.50,-80.22],L9Z:[44.52,-80.22],
  M1A:[43.76,-79.21],M1B:[43.79,-79.21],M1C:[43.78,-79.13],M1E:[43.76,-79.18],
  M1G:[43.77,-79.21],M1H:[43.77,-79.25],M1J:[43.74,-79.27],M1K:[43.71,-79.27],
  M1L:[43.71,-79.29],M1M:[43.71,-79.32],M1N:[43.70,-79.27],M1P:[43.75,-79.27],
  M1R:[43.75,-79.30],M1S:[43.79,-79.28],M1T:[43.78,-79.30],M1V:[43.81,-79.28],
  M1W:[43.80,-79.32],M1X:[43.82,-79.22],M2A:[43.74,-79.34],M2H:[43.80,-79.38],
  M2J:[43.78,-79.38],M2K:[43.77,-79.39],M2L:[43.74,-79.38],M2M:[43.78,-79.41],
  M2N:[43.76,-79.41],M2P:[43.75,-79.40],M2R:[43.79,-79.44],M3A:[43.74,-79.32],
  M3B:[43.74,-79.34],M3C:[43.72,-79.34],M3H:[43.76,-79.44],M3J:[43.76,-79.49],
  M3K:[43.73,-79.47],M3L:[43.73,-79.51],M3M:[43.72,-79.48],M3N:[43.74,-79.53],
  M4A:[43.72,-79.31],M4B:[43.71,-79.32],M4C:[43.69,-79.32],M4E:[43.68,-79.30],
  M4G:[43.71,-79.36],M4H:[43.70,-79.35],M4J:[43.68,-79.34],M4K:[43.67,-79.35],
  M4L:[43.67,-79.33],M4M:[43.66,-79.34],M4N:[43.72,-79.39],M4P:[43.71,-79.40],
  M4R:[43.71,-79.41],M4S:[43.70,-79.39],M4T:[43.69,-79.39],M4V:[43.68,-79.41],
  M4W:[43.67,-79.38],M4X:[43.66,-79.37],M4Y:[43.67,-79.38],M5A:[43.65,-79.36],
  M5B:[43.65,-79.37],M5C:[43.65,-79.38],M5E:[43.64,-79.37],M5G:[43.66,-79.39],
  M5H:[43.65,-79.38],M5J:[43.64,-79.38],M5K:[43.65,-79.38],M5L:[43.65,-79.38],
  M5M:[43.73,-79.41],M5N:[43.72,-79.41],M5P:[43.70,-79.41],M5R:[43.68,-79.41],
  M5S:[43.66,-79.40],M5T:[43.65,-79.40],M5V:[43.64,-79.40],M5W:[43.64,-79.38],
  M5X:[43.65,-79.38],M6A:[43.69,-79.44],M6B:[43.69,-79.45],M6C:[43.68,-79.44],
  M6E:[43.68,-79.45],M6G:[43.66,-79.43],M6H:[43.66,-79.44],M6J:[43.64,-79.43],
  M6K:[43.64,-79.43],M6L:[43.72,-79.50],M6M:[43.69,-79.48],M6N:[43.67,-79.48],
  M6P:[43.66,-79.46],M6R:[43.64,-79.45],M6S:[43.64,-79.46],M7A:[43.66,-79.39],
  M7R:[43.64,-79.38],M7Y:[43.65,-79.34],M8V:[43.61,-79.49],M8W:[43.60,-79.50],
  M8X:[43.65,-79.49],M8Y:[43.64,-79.48],M8Z:[43.63,-79.51],M9A:[43.66,-79.52],
  M9B:[43.65,-79.55],M9C:[43.65,-79.55],M9L:[43.74,-79.57],M9M:[43.74,-79.54],
  M9N:[43.71,-79.53],M9P:[43.70,-79.54],M9R:[43.69,-79.56],M9V:[43.73,-79.60],
  M9W:[43.71,-79.61],
  // ── Alberta (T) ───────────────────────────────────────────────────────────
  T0A:[53.02,-112.29],T0B:[52.74,-111.82],T0C:[54.46,-114.30],T0E:[54.72,-116.79],
  T0G:[55.20,-118.07],T0H:[56.23,-117.29],T0J:[50.15,-112.73],T0K:[49.53,-113.89],
  T0L:[50.67,-114.50],T0M:[51.74,-113.43],T0P:[57.04,-111.23],
  T1A:[49.72,-112.82],T1B:[49.73,-112.79],T1C:[49.74,-112.83],T1G:[49.71,-112.84],
  T1H:[49.71,-112.82],T1J:[49.70,-112.83],T1K:[49.69,-112.82],T1L:[51.18,-115.57],
  T1M:[49.70,-112.82],T1P:[50.03,-111.73],T1R:[50.00,-110.67],T1S:[50.60,-113.98],
  T1V:[50.59,-113.96],T1W:[51.13,-115.34],T1X:[51.09,-113.88],T1Y:[51.10,-113.91],
  T2A:[51.05,-113.99],T2B:[51.06,-113.96],T2C:[50.98,-114.07],T2E:[51.08,-114.07],
  T2G:[51.04,-114.07],T2H:[50.98,-114.09],T2J:[50.96,-114.06],T2K:[51.10,-114.10],
  T2L:[51.09,-114.10],T2M:[51.08,-114.10],T2N:[51.07,-114.11],T2P:[51.05,-114.07],
  T2R:[51.04,-114.08],T2S:[51.01,-114.08],T2T:[51.01,-114.09],T2V:[50.99,-114.10],
  T2W:[50.95,-114.10],T2X:[50.90,-114.10],T2Y:[50.89,-114.07],T2Z:[50.91,-114.06],
  T3A:[51.07,-114.16],T3B:[51.09,-114.18],T3C:[51.04,-114.15],T3E:[51.02,-114.14],
  T3G:[51.10,-114.20],T3H:[51.01,-114.17],T3J:[51.10,-113.92],T3K:[51.13,-114.00],
  T3L:[51.13,-114.15],T3M:[50.86,-114.06],T3N:[51.18,-113.99],T3P:[51.20,-113.98],
  T3R:[51.19,-114.20],T3S:[50.88,-114.07],T3Z:[51.02,-114.33],
  T4A:[53.87,-113.42],T4B:[53.52,-113.50],T4C:[53.27,-115.10],T4E:[53.55,-113.47],
  T4G:[52.61,-114.64],T4H:[52.17,-113.75],T4J:[52.49,-113.61],T4L:[52.17,-113.74],
  T4N:[52.35,-113.39],T4P:[53.37,-112.03],T4R:[52.26,-113.81],T4S:[52.25,-113.81],
  T4T:[52.71,-116.48],T4V:[53.08,-113.46],T4X:[53.37,-113.43],
  T5A:[53.54,-113.43],T5B:[53.56,-113.47],T5C:[53.57,-113.51],T5E:[53.54,-113.52],
  T5G:[53.55,-113.49],T5H:[53.54,-113.49],T5J:[53.54,-113.49],T5K:[53.55,-113.51],
  T5L:[53.55,-113.53],T5M:[53.55,-113.55],T5N:[53.56,-113.55],T5P:[53.55,-113.57],
  T5R:[53.55,-113.58],T5S:[53.54,-113.57],T5T:[53.53,-113.60],T5V:[53.57,-113.57],
  T5W:[53.56,-113.46],T5X:[53.59,-113.51],T5Y:[53.60,-113.49],T5Z:[53.60,-113.52],
  T6A:[53.53,-113.44],T6B:[53.53,-113.46],T6C:[53.53,-113.47],T6E:[53.51,-113.49],
  T6G:[53.52,-113.52],T6H:[53.50,-113.52],T6J:[53.50,-113.48],T6K:[53.50,-113.46],
  T6L:[53.47,-113.46],T6M:[53.47,-113.53],T6N:[53.47,-113.47],T6P:[53.44,-113.46],
  T6R:[53.50,-113.57],T6S:[53.49,-113.55],T6T:[53.43,-113.44],T6V:[53.55,-113.52],
  T6W:[53.45,-113.55],T6X:[53.41,-113.44],T7A:[54.13,-114.46],T7E:[53.85,-113.44],
  T7N:[53.66,-113.46],T7P:[53.65,-113.45],T7S:[53.63,-113.46],T7V:[53.62,-113.45],
  T7X:[53.41,-113.52],T7Y:[53.57,-113.44],T7Z:[53.61,-113.47],
  T8A:[53.42,-113.45],T8B:[53.42,-113.43],T8C:[53.37,-113.42],T8E:[53.34,-113.42],
  T8G:[53.30,-113.42],T8H:[53.62,-111.97],T8L:[53.62,-113.81],T8N:[53.65,-113.80],
  T8R:[53.68,-113.76],T8S:[53.71,-113.73],T8T:[53.74,-113.69],T8V:[53.55,-114.07],
  T8W:[53.90,-114.44],T8X:[53.43,-113.47],
  T9A:[53.57,-110.84],T9C:[53.58,-110.84],T9E:[53.57,-113.83],T9G:[53.56,-113.82],
  T9H:[56.73,-111.38],T9J:[56.70,-111.40],T9K:[56.74,-111.37],T9M:[56.22,-120.84],
  T9N:[56.22,-120.84],T9S:[57.79,-111.41],T9V:[58.78,-122.70],T9W:[59.29,-120.38],
  // ── Colombie-Britannique (V) ──────────────────────────────────────────────
  V0A:[49.48,-115.03],V0B:[49.12,-115.78],V0C:[54.03,-122.13],V0E:[50.62,-120.74],
  V0G:[49.08,-117.65],V0H:[49.42,-119.37],V0J:[55.96,-121.97],V0K:[51.86,-121.58],
  V0L:[50.73,-122.97],V0M:[49.22,-121.93],V0N:[49.60,-124.01],V0P:[48.83,-123.71],
  V0R:[49.46,-124.72],V0S:[48.64,-123.42],V0T:[48.95,-124.83],V0V:[55.10,-128.66],
  V0W:[59.56,-135.06],V0X:[49.33,-120.78],
  V1A:[49.50,-115.77],V1B:[50.67,-120.34],V1C:[49.48,-115.79],V1E:[50.68,-120.32],
  V1G:[55.68,-120.17],V1H:[49.85,-119.41],V1J:[56.23,-120.83],V1K:[50.36,-121.35],
  V1L:[49.49,-117.29],V1M:[49.13,-122.68],V1N:[49.16,-122.64],V1P:[49.18,-122.63],
  V1R:[49.07,-117.64],V1S:[50.67,-120.32],V1T:[50.10,-119.47],V1V:[50.08,-119.43],
  V1W:[49.88,-119.45],V1X:[49.88,-119.44],V1Y:[49.88,-119.47],V1Z:[49.89,-119.55],
  V2A:[49.45,-119.60],V2B:[50.29,-121.34],V2C:[50.67,-120.33],V2E:[49.35,-119.04],
  V2G:[52.13,-121.95],V2H:[50.68,-120.37],V2J:[52.99,-122.12],V2K:[53.91,-122.73],
  V2L:[53.88,-122.81],V2M:[53.91,-122.74],V2N:[53.92,-122.73],V2P:[49.13,-122.36],
  V2R:[49.13,-122.34],V2S:[49.10,-122.34],V2T:[49.10,-122.35],V2V:[49.11,-122.37],
  V2W:[49.13,-122.40],V2X:[49.18,-122.30],V2Y:[49.20,-122.29],V2Z:[49.18,-122.34],
  V3A:[49.13,-122.62],V3B:[49.24,-122.72],V3C:[49.25,-122.77],V3E:[49.27,-122.72],
  V3G:[49.10,-122.36],V3H:[49.24,-122.87],V3J:[49.25,-122.90],V3K:[49.21,-122.87],
  V3L:[49.21,-122.85],V3M:[49.21,-122.86],V3N:[49.21,-122.88],V3R:[49.25,-122.87],
  V3S:[49.18,-122.81],V3T:[49.18,-122.86],V3V:[49.22,-122.90],V3W:[49.16,-122.86],
  V3X:[49.17,-122.83],V3Y:[49.17,-122.82],
  V4A:[49.06,-122.80],V4B:[49.10,-122.75],V4C:[49.27,-122.93],V4E:[49.07,-122.72],
  V4G:[49.08,-122.70],V4K:[49.11,-122.90],V4L:[49.02,-122.99],V4M:[49.10,-123.00],
  V4N:[49.28,-122.93],V4P:[49.03,-122.94],V4R:[49.29,-122.96],V4S:[49.07,-122.61],
  V4T:[49.07,-122.69],V4V:[49.08,-122.67],V4W:[49.09,-122.68],V4X:[49.09,-122.64],
  V5A:[49.24,-122.97],V5B:[49.28,-123.02],V5C:[49.27,-123.02],V5E:[49.23,-123.00],
  V5G:[49.27,-123.01],V5H:[49.21,-122.99],V5J:[49.23,-123.07],V5K:[49.28,-123.06],
  V5L:[49.28,-123.07],V5M:[49.26,-123.04],V5N:[49.26,-123.07],V5P:[49.22,-123.07],
  V5R:[49.23,-123.04],V5S:[49.22,-123.03],V5T:[49.26,-123.09],V5V:[49.25,-123.10],
  V5W:[49.22,-123.10],V5X:[49.21,-123.10],V5Y:[49.26,-123.12],V5Z:[49.26,-123.12],
  V6A:[49.28,-123.10],V6B:[49.28,-123.11],V6C:[49.29,-123.12],V6E:[49.28,-123.13],
  V6G:[49.29,-123.14],V6H:[49.27,-123.14],V6J:[49.26,-123.14],V6K:[49.26,-123.13],
  V6L:[49.24,-123.17],V6M:[49.23,-123.16],V6N:[49.22,-123.16],V6P:[49.22,-123.12],
  V6R:[49.27,-123.17],V6S:[49.27,-123.18],V6T:[49.27,-123.25],V6V:[49.16,-122.83],
  V6W:[49.21,-123.09],V6X:[49.18,-123.14],V6Y:[49.19,-123.14],V6Z:[49.28,-123.12],
  V7A:[49.13,-123.15],V7B:[49.19,-123.17],V7C:[49.22,-122.98],V7E:[49.20,-123.03],
  V7G:[49.34,-122.87],V7H:[49.35,-122.88],V7J:[49.32,-123.02],V7K:[49.33,-122.98],
  V7L:[49.32,-123.10],V7M:[49.30,-123.10],V7N:[49.32,-123.04],V7P:[49.35,-123.09],
  V7R:[49.37,-123.07],V7S:[49.38,-123.07],V7T:[49.39,-123.09],V7V:[49.44,-123.21],
  V7W:[49.42,-123.28],V7X:[49.29,-123.12],V7Y:[49.28,-123.12],
  V8A:[50.74,-127.49],V8B:[49.83,-124.52],V8C:[53.93,-122.75],V8G:[54.52,-128.60],
  V8J:[50.57,-126.04],V8K:[50.08,-125.26],V8L:[48.55,-123.55],V8M:[48.55,-123.41],
  V8N:[48.45,-123.35],V8P:[48.45,-123.36],V8R:[48.43,-123.37],V8S:[48.43,-123.39],
  V8T:[48.43,-123.38],V8V:[48.42,-123.37],V8W:[48.43,-123.37],V8X:[48.46,-123.40],
  V8Y:[48.47,-123.43],V8Z:[48.47,-123.44],
  V9A:[48.42,-123.39],V9B:[48.44,-123.44],V9C:[48.44,-123.49],V9E:[48.47,-123.49],
  V9G:[48.78,-123.70],V9J:[49.57,-124.43],V9K:[49.03,-124.69],V9L:[48.82,-123.57],
  V9M:[48.93,-123.68],V9N:[49.59,-124.55],V9P:[49.68,-124.92],V9R:[49.15,-123.94],
  V9S:[49.14,-123.99],V9T:[49.48,-124.42],V9V:[49.18,-124.02],
};

function resolvePostalCodeCoords(postalCode?: string | null): [number, number] | null {
  const clean = String(postalCode || "").replace(/\s/g, "").toUpperCase();
  if (clean.length < 3) return null;
  const fsa3 = clean.slice(0, 3);
  if (FSA_COORDS_SERVER[fsa3]) return FSA_COORDS_SERVER[fsa3];
  // 2-char fallback for sparse entries
  const fsa2 = clean.slice(0, 2);
  const entry = Object.entries(FSA_COORDS_SERVER).find(([k]) => k.startsWith(fsa2));
  return entry ? entry[1] : null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seed();

  // ── Passport Local Strategy ─────────────────────────────────────────
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await storage.getUserByEmailWithHash(email);
        if (!user) return done(null, false, { message: "Email ou mot de passe incorrect" });
        if (!user.passwordHash)
          return done(null, false, { message: "Compte non configuré — contactez l'administrateur" });
        if (!verifyPassword(password, user.passwordHash))
          return done(null, false, { message: "Email ou mot de passe incorrect" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );
  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? null);
    } catch (err) {
      done(err);
    }
  });

  // requireAuth middleware
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (req.isAuthenticated()) return next();
    return res.status(401).json({ error: "Authentification requise" });
  }

  // Clear cached API responses after successful data mutations.
  app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      res.on("finish", () => {
        if (res.statusCode < 400) {
          clearApiResponseCache();
        }
      });
    }
    next();
  });

  // ── Auth routes (public) ────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Identifiants incorrects" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { passwordHash, ...safeUser } = user;
        res.json({ ...safeUser, mustChangePassword: user.mustChangePassword ?? true });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ error: "Non authentifié" });
    const { passwordHash, ...safeUser } = req.user as any;
    // Re-fetch mustChangePassword fresh from DB
    storage.getUserByEmailWithHash((req.user as any).email).then(u => {
      res.json({ ...safeUser, mustChangePassword: u?.mustChangePassword ?? true });
    }).catch(() => res.json(safeUser));
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword)
        return res.status(400).json({ error: "Les deux champs sont requis" });
      if (typeof newPassword !== "string" || newPassword.length < 6)
        return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
      const userId = (req.user as any).id;
      const userWithHash = await storage.getUserByEmailWithHash((req.user as any).email);
      if (!userWithHash?.passwordHash || !verifyPassword(currentPassword, userWithHash.passwordHash))
        return res.status(401).json({ error: "Mot de passe actuel incorrect" });
      await storage.setUserPassword(userId, hashPassword(newPassword));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Force-set password — only allowed when the user is flagged mustChangePassword.
  // Used by the post-login "Create your password" screen so the user does not need
  // to know their (admin-reset / temporary) current password.
  app.post("/api/auth/force-set-password", requireAuth, async (req, res, next) => {
    try {
      const { newPassword } = req.body;
      if (typeof newPassword !== "string" || newPassword.length < 6)
        return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
      const userId = (req.user as any).id;
      const fresh = await storage.getUser(userId);
      if (!fresh) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (fresh.mustChangePassword !== true) {
        return res.status(403).json({ error: "Action non autorisée — utilisez change-password" });
      }
      await storage.setUserPassword(userId, hashPassword(newPassword));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── Protect all other /api routes ──────────────────────────────────
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/auth/")) return next();
    if (req.path.startsWith("/public/")) return next();
    // Intimura bookmarklet endpoints have their own per-token auth and are
    // called from crm.intimura.com (cross-origin), so they must bypass the
    // session-cookie auth gate.
    if (
      req.path === "/intimura/ingest" ||
      req.path === "/intimura/ingest-details" ||
      req.path === "/intimura/bookmarklet.js"
    ) {
      return next();
    }
    if (req.method === "OPTIONS") return next();
    return requireAuth(req, res, next);
  });
  // ───────────────────────────────────────────────────────────────────

  // ── Public invite routes ────────────────────────────────────────────
  // GET /i/:token — short redirect used in invite emails and SMS gateways
  app.get("/i/:token", async (req, res) => {
    const user = await storage.getUserByInviteToken(req.params.token);
    if (!user) return res.status(404).send("Lien invalide ou expiré");
    res.redirect(`${process.env.APP_URL || "https://cloture-crm.onrender.com"}/#/accept-invite?token=${req.params.token}`);
  });

  // GET /api/auth/invite/:token — check token, return user info (no sensitive data)
  app.get("/api/auth/invite/:token", async (req, res) => {
    const user = await storage.getUserByInviteToken(req.params.token);
    if (!user) return res.status(404).json({ error: "Lien invalide ou expiré" });
    res.json({ name: user.name, email: user.email, role: user.role });
  });

  // POST /api/auth/accept-invite — set password, clear token, log user in
  app.post("/api/auth/accept-invite", async (req, res, next) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: "Données manquantes" });
      if (typeof password !== "string" || password.length < 6)
        return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      const user = await storage.getUserByInviteToken(token);
      if (!user) return res.status(404).json({ error: "Lien invalide ou expiré" });
      await storage.setUserPassword(user.id, hashPassword(password));
      await storage.clearInviteToken(user.id);
      // Log the user in automatically
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ ...user, mustChangePassword: false });
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/installer-profile-complete — installer confirms subcontractor form completion
  app.post("/api/auth/installer-profile-complete", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "installer") {
        return res.status(403).json({ error: "Acces reserve aux installateurs" });
      }
      await storage.setInstallerProfileCompleted(user.id, true);
      const refreshed = await storage.getUserByEmailWithHash(user.email);
      return res.json({ ok: true, installerProfileCompleted: refreshed?.installerProfileCompleted ?? true });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/auth/installer-profile-data", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "installer") {
        return res.status(403).json({ error: "Acces reserve aux installateurs" });
      }
      const raw = await storage.getInstallerProfileFormData(user.id);
      let data: Record<string, any> = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
      }
      return res.json({ ok: true, data });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/auth/installer-profile-data", requireAuth, async (req, res, next) => {
    try {
      const user = req.user as any;
      if (!user || user.role !== "installer") {
        return res.status(403).json({ error: "Acces reserve aux installateurs" });
      }
      const data = req.body?.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return res.status(400).json({ error: "Payload invalide" });
      }
      const json = JSON.stringify(data);
      if (json.length > 200000) {
        return res.status(400).json({ error: "Fiche trop volumineuse" });
      }
      await storage.setInstallerProfileFormData(user.id, json);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // Serve subcontractor onboarding form HTML used after installer password creation
  app.get("/installer-sous-traitant-form", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).send("Authentification requise");
    }

    const user = req.user as any;
    if (user.role !== "installer" && user.role !== "admin") {
      return res.status(403).send("Acces refuse");
    }

    const formNames = ["fiche_sous_traitant_interactive (1).html", "fiche_sous_traitant_interactive.html"];
    const candidates: string[] = [];

    // Resolve from current working directory and up to 5 parent levels to survive different deploy cwd values.
    let cursor = process.cwd();
    for (let i = 0; i < 6; i += 1) {
      for (const name of formNames) {
        candidates.push(path.resolve(cursor, name));
      }
      const parent = path.resolve(cursor, "..");
      if (parent === cursor) break;
      cursor = parent;
    }

    const formPath = candidates.find((p) => existsSync(p));
    if (!formPath) {
      return res.status(404).send("Fiche sous-traitant introuvable");
    }

    return res.sendFile(formPath);
  });
  // ───────────────────────────────────────────────────────────────────

  // GET /api/users/:id/installer-form-data — read a specific installer's form (admin/directors)
  app.get("/api/users/:id/installer-form-data", requireAuth, async (req, res, next) => {
    try {
      const actor = req.user as any;
      const allowed = ["admin", "sales_director", "install_director"];
      if (!allowed.includes(actor?.role)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) return res.status(400).json({ error: "ID invalide" });
      const raw = await storage.getInstallerProfileFormData(userId);
      if (!raw) return res.json({ data: null });
      try {
        return res.json({ data: JSON.parse(raw) });
      } catch {
        return res.json({ data: null });
      }
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/:id/installer-form-data — admin edits an installer's form
  app.put("/api/users/:id/installer-form-data", requireAuth, async (req, res, next) => {
    try {
      const actor = req.user as any;
      if (actor?.role !== "admin") {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) return res.status(400).json({ error: "ID invalide" });
      const { data } = req.body;
      if (!data || typeof data !== "object") return res.status(400).json({ error: "Données invalides" });
      const json = JSON.stringify(data);
      if (json.length > 200000) return res.status(400).json({ error: "Fiche trop volumineuse" });
      await storage.setInstallerProfileFormData(userId, json);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/installer-profiles — all installer territories for heatmap (admin/directors/sales_rep)
  app.get("/api/installer-profiles", requireAuth, async (req, res, next) => {
    try {
      const actor = req.user as any;
      const allowed = ["admin", "sales_director", "install_director", "sales_rep", "installer"];
      if (!allowed.includes(actor?.role)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const cached = getCachedApiResponse<any[]>(req);
      if (cached) {
        return res.json(cached);
      }
      const users = await storage.getUsers();
      const installers = users.filter((u: any) => {
        if (u.role !== "installer") return false;
        // Installers can access the endpoint to render the heatmap, but only
        // for their own profile; managers can see all installer territories.
        if (actor?.role === "installer") return u.id === actor?.id;
        return true;
      });
      const profiles = await Promise.all(
        installers.map(async (u: any) => {
          const raw = await storage.getInstallerProfileFormData(u.id);
          let formData: Record<string, string | boolean> = {};
          if (raw) {
            try { formData = JSON.parse(raw); } catch { /* ignore */ }
          }
          return {
            userId: u.id,
            displayName: (formData.field_0 as string) || (formData.field_2 as string) || u.email,
            city: (formData.field_7 as string) || "",
            province: (formData.field_8 as string) || "",
            // Prefer the heatmap-specific postal code (field_14); fall back to the
            // company's regular postal code (field_9) so installers who only
            // filled the standard address still appear on the heatmap.
            postalCode: (
              ((formData.field_14 as string) || (formData.field_9 as string) || "")
            ).replace(/\s/g, "").toUpperCase(),
            radius: (formData.field_13 as string) || "",
            regions: (formData.field_12 as string) || "",
            latLng: null as [number, number] | null,
          };
        })
      );

      const withCoords = await Promise.all(
        profiles.map(async (p) => ({
          ...p,
          latLng: resolvePostalCodeCoords(p.postalCode),
        }))
      );
      // Return every installer profile that has at least *some* location hint
      // (postal code OR city) so the heatmap can render them. Client-side
      // fallback handles missing coords / radius.
      const visibleProfiles = withCoords.filter(p => p.postalCode || p.city);
      setCachedApiResponse(req, visibleProfiles);
      res.json(visibleProfiles);
    } catch (err) {
      next(err);
    }
  });

  // -------- Users --------
  app.get("/api/users", async (req, res) => {
    const cached = getCachedApiResponse<any[]>(req);
    if (cached) {
      return res.json(cached);
    }
    const users = await storage.getUsers();
    setCachedApiResponse(req, users);
    res.json(users);
  });

  const userMutationErrorMessage = (error: any) => {
    const code = String(error?.code || "");
    const detail = String(error?.detail || "");
    const message = String(error?.message || "");
    const full = `${message} ${detail}`.toLowerCase();

    if (code === "23505" || full.includes("duplicate key") || full.includes("users_email_key") || full.includes("email")) {
      return "Ce courriel est deja utilise par un autre utilisateur.";
    }
    if (code === "23502" || full.includes("null value")) {
      return "Un champ obligatoire est manquant.";
    }
    return "Impossible d'enregistrer l'utilisateur.";
  };

  app.post("/api/users", async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const user = await storage.createUser(parsed.data);
      if (user.role === "installer") {
        await storage.setInstallerProfileCompleted(user.id, false);
      }
      const freshUser = (await storage.getUser(user.id)) || user;
      // Generate invite token (7-day expiry) and send welcome email
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await storage.setInviteToken(freshUser.id, token, expiresAt);
      const baseUrl = process.env.APP_URL || `https://cloture-crm.onrender.com`;
      const inviteUrl = `${baseUrl}/i/${token}`;
      const [emailResult, smsResult] = await Promise.all([
        sendInviteEmail(freshUser.email, freshUser.name, freshUser.role, inviteUrl),
        sendInviteSms(freshUser.phone ?? "", freshUser.smsCarrier ?? "", freshUser.name, freshUser.role, inviteUrl),
      ]);
      res.json({
        ...freshUser,
        inviteUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (error: any) {
      res.status(400).json({ error: userMutationErrorMessage(error) });
    }
  });
  app.post("/api/users/:id/resend-invite", async (req, res) => {
    try {
      const user = await storage.getUser(Number(req.params.id));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await storage.setInviteToken(user.id, token, expiresAt);
      const baseUrl = process.env.APP_URL || "https://cloture-crm.onrender.com";
      const inviteUrl = `${baseUrl}/i/${token}`;
      const [emailResult, smsResult] = await Promise.all([
        sendInviteEmail(user.email, user.name, user.role, inviteUrl),
        sendInviteSms(user.phone ?? "", user.smsCarrier ?? "", user.name, user.role, inviteUrl),
      ]);
      res.json({
        ok: true,
        inviteUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erreur lors du renvoi" });
    }
  });

  // ── Admin: reset a user's password ─────────────────────────────────
  // POST /api/users/:id/admin-reset-password
  // Body: { newPassword?: string } (omit to auto-generate). Returns { ok, tempPassword }.
  app.post("/api/users/:id/admin-reset-password", requireAuth, async (req, res) => {
    try {
      const actorRole = (req.user as any)?.role;
      if (actorRole !== "admin") {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ error: "Utilisateur introuvable" });

      let newPassword = String(req.body?.newPassword || "").trim();
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres." });
      }
      if (!newPassword) {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        const buf = randomBytes(12);
        newPassword = Array.from(buf).map(b => chars[b % chars.length]).join("");
      }
      const hash = hashPassword(newPassword);
      await storage.adminResetUserPassword(id, hash);
      res.json({ ok: true, tempPassword: newPassword });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  app.post("/api/users/:id/resend-installer-form", async (req, res) => {
    try {
      const actorRole = (req.user as any)?.role;
      if (!["admin", "sales_director", "install_director"].includes(actorRole)) {
        return res.status(403).json({ error: "Acces refuse" });
      }

      const user = await storage.getUser(Number(req.params.id));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (user.role !== "installer") return res.status(400).json({ error: "Cet utilisateur n'est pas un installateur" });

      await storage.setInstallerProfileCompleted(user.id, false);

      const baseUrl = process.env.APP_URL || "https://cloture-crm.onrender.com";
      const loginUrl = `${baseUrl}/`;
      const [emailResult, smsResult] = await Promise.all([
        sendInstallerProfileReminderEmail(user.email, user.name, loginUrl),
        sendInstallerProfileReminderSms(user.phone ?? "", user.smsCarrier ?? "", user.name, loginUrl),
      ]);

      const actor = (req.user as any)?.name || "Admin";
      const actorRoleSafe = (req.user as any)?.role || "admin";
      const channels: string[] = [];
      if (emailResult.ok) channels.push("email");
      if (smsResult.ok) channels.push("sms");
      const channelText = channels.length ? channels.join("+") : "none";
      const errorText = [emailResult.error ? `email=${emailResult.error}` : null, smsResult.error ? `sms=${smsResult.error}` : null]
        .filter(Boolean)
        .join(" | ");

      await storage.createActivity({
        userId: (req.user as any)?.id || null,
        userName: actor,
        userRole: actorRoleSafe,
        action: "installer_form_reminder",
        note: `Rappel fiche installateur envoye a ${user.name} (${user.email}) - canaux: ${channelText}${errorText ? ` - erreurs: ${errorText}` : ""}`,
      });

      res.json({
        ok: true,
        loginUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erreur lors de l'envoi du rappel" });
    }
  });
  app.patch("/api/users/:id/installer-profile-status", async (req, res) => {
    try {
      const actor = req.user as any;
      if (!["admin", "sales_director", "install_director"].includes(actor?.role)) {
        return res.status(403).json({ error: "Acces refuse" });
      }

      const user = await storage.getUser(Number(req.params.id));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (user.role !== "installer") return res.status(400).json({ error: "Cet utilisateur n'est pas un installateur" });

      const completed = req.body?.completed === true;
      await storage.setInstallerProfileCompleted(user.id, completed);

      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "installer_form_status",
        note: `${completed ? "Fiche installateur marquee completee" : "Fiche installateur marquee non completee"} pour ${user.name} (${user.email})`,
      });

      const refreshed = await storage.getUser(user.id);
      return res.json({ ok: true, installerProfileCompleted: refreshed?.installerProfileCompleted ?? completed });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Erreur lors de la mise a jour de la fiche" });
    }
  });
  app.patch("/api/users/:id", async (req, res) => {
    const parsed = insertUserSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const updated = await storage.updateUser(Number(req.params.id), parsed.data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: userMutationErrorMessage(error) });
    }
  });
  app.delete("/api/users/:id", async (req, res) => {
    const deleted = await storage.deleteUser(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted });
  });

  // -------- Leads --------
  app.get("/api/leads", async (req, res) => {
    const cached = getCachedApiResponse<any[]>(req);
    if (cached) {
      return res.json(cached);
    }
    const actor = req.user as any;
    let leads = await storage.getLeads();
    // Sales reps only see leads assigned to them.
    if (actor?.role === "sales_rep") {
      leads = leads.filter((l: any) => l.assignedSalesId === actor.id);
    }
    setCachedApiResponse(req, leads);
    res.json(leads);
  });
  app.get("/api/leads/:id", async (req, res) => {
    const lead = await storage.getLead(Number(req.params.id));
    if (!lead) return res.status(404).json({ error: "Not found" });
    const actor = req.user as any;
    if (actor?.role === "sales_rep" && lead.assignedSalesId !== actor.id) {
      return res.status(403).json({ error: "Acces refuse" });
    }
    res.json(lead);
  });
  app.post("/api/leads", async (req, res) => {
    const parsed = insertLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const lead = await storage.createLead(parsed.data);
    await storage.createActivity({
      leadId: lead.id,
      userId: req.body._userId || null,
      userName: req.body._userName || "Système",
      userRole: req.body._userRole || "system",
      action: "create",
      note: `Lead créé depuis ${lead.source || "email"} — secteur ${lead.sector}`,
    });
    res.json(lead);
  });
  app.patch("/api/leads/:id", async (req, res) => {
    const leadId = Number(req.params.id);
    const before = await storage.getLead(leadId);
    if (!before) return res.status(404).json({ error: "Not found" });

    const { _userId, _userName, _userRole, ...payload } = req.body;
    if (payload.status === "test") {
      payload.assignedSalesId = null;
    }
    const updated = await storage.updateLead(leadId, payload);
    if (!updated) return res.status(404).json({ error: "Not found" });

    let assignedRepName: string | null = null;
    if (payload.assignedSalesId && Number(payload.assignedSalesId) !== (before.assignedSalesId || null)) {
      const rep = await storage.getUser(Number(payload.assignedSalesId));
      assignedRepName = rep?.name || null;
      if (rep?.email) {
        const emailResult = await sendLeadAssignedEmail({
          to: rep.email,
          salesRepName: rep.name,
          leadClientName: updated.clientName,
          city: updated.city,
          province: updated.province,
          fenceType: updated.fenceType,
        });
        if (!emailResult.ok) {
          console.warn("[lead-assignment-email] failed:", emailResult.error || "unknown error");
        }
      }
    }

    await storage.createActivity({
      leadId: updated.id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: "update",
      note: payload.status === "test"
        ? "Classé en test"
        : assignedRepName
        ? `Assignation vendeur → ${assignedRepName} (notification envoyée)`
        : payload.status
          ? `Statut → ${payload.status}`
          : (payload.assignedSalesId ? `Assignation vendeur` : "Mise à jour lead"),
    });
    res.json(updated);
  });

  // Delete lead (admin only)
  app.delete("/api/leads/:id", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (actor?.role !== "admin") {
      return res.status(403).json({ error: "Acces refuse — admin requis" });
    }
    const leadId = Number(req.params.id);
    if (isNaN(leadId)) return res.status(400).json({ error: "ID invalide" });

    const lead = await storage.getLead(leadId);
    if (!lead) return res.status(404).json({ error: "Lead introuvable" });

    try {
      await storage.deleteLead(leadId);
      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "lead_deleted",
        note: `Lead supprime: ${lead.clientName} (id ${leadId}, source ${lead.source || "n/a"})`,
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[DELETE /api/leads/:id] error", err);
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  // -------- Public lead intake (website soumission form) --------
  // CORS open to clotureimpress.com (apex + www) and the GitHub Pages preview origin.
  const PUBLIC_LEAD_ORIGINS = new Set([
    "https://clotureimpress.com",
    "https://www.clotureimpress.com",
    "https://befcoinc.github.io",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:5500",
  ]);
  const applyPublicCors = (req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && PUBLIC_LEAD_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  };
  app.options("/api/public/lead", (req, res) => {
    applyPublicCors(req, res);
    res.status(204).end();
  });
  app.post("/api/public/lead", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const b = req.body || {};
      // Accept both raw schema fields and the website's French names.
      const prenom = String(b.prenom || b.firstName || "").trim();
      const nom = String(b.nom || b.lastName || "").trim();
      const fullName = String(b.clientName || `${prenom} ${nom}`).trim();
      const phone = String(b.telephone || b.phone || "").trim() || null;
      const email = String(b.email || b.courriel || "").trim() || null;
      const city = String(b.ville || b.city || "").trim() || null;
      const fenceMap: Record<string, string> = {
        ornementale: "ornemental",
        maille: "mailles",
        intimite: "intimité",
        commercial: "industrielle",
        portail: "ornemental",
        verre: "ornemental",
        autre: "À confirmer",
      };
      const rawService = String(b.service || b.fenceType || "").trim();
      const fenceType = fenceMap[rawService] || rawService || null;
      const message = String(b.message || "").trim() || null;

      if (!fullName || (!phone && !email)) {
        return res.status(400).json({ error: "Nom et au moins un moyen de contact requis." });
      }
      // Basic anti-bot honeypot: any value in `website` field rejects silently.
      if (b.website) return res.json({ ok: true });

      const lead = await storage.createLead({
        clientName: fullName,
        phone,
        email,
        address: null,
        city,
        province: "QC",
        postalCode: null,
        neighborhood: city,
        fenceType,
        message,
        source: "web",
        intimuraId: null,
        status: "nouveau",
        assignedSalesId: null,
        estimatedValue: null,
        estimatedLength: null,
      });
      await storage.createActivity({
        leadId: lead.id,
        userId: null,
        userName: "Site web",
        userRole: "system",
        action: "create",
        note: `Lead créé depuis le formulaire du site — secteur ${lead.sector}`,
      });
      res.json({ ok: true, id: lead.id });
    } catch (err) {
      console.error("[public/lead] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // -------- Public installer application --------
  app.options("/api/public/installer-application", (req, res) => {
    applyPublicCors(req, res);
    res.status(204).end();
  });
  app.post("/api/public/installer-application", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const b = req.body || {};
      // honeypot
      if (b.website_url) return res.json({ ok: true });

      const companyName = String(b.companyName || "").trim();
      const contactName = String(b.contactName || "").trim();
      const phone = String(b.phone || "").trim();
      const email = String(b.email || "").trim();

      if (!companyName || !contactName || !phone || !email) {
        return res.status(400).json({ error: "Champs obligatoires manquants." });
      }

      const application = await storage.createInstallerApplication({
        companyName,
        website: String(b.website || "").trim() || null,
        address: String(b.address || "").trim() || null,
        yearFounded: String(b.yearFounded || "").trim() || null,
        employeeCount: String(b.employeeCount || "").trim() || null,
        regions: String(b.regions || "").trim() || null,
        contactName,
        phone,
        email,
        fenceTypes: String(b.fenceTypes || "").trim() || null,
        yearsExperience: String(b.yearsExperience || "").trim() || null,
        status: "en_attente",
        notes: null,
      });

      return res.json({ ok: true, id: application.id });
    } catch (err) {
      console.error("[public/installer-application] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/installer-applications", requireAuth, async (req, res) => {
    try {
      const includeArchived = String(req.query.archived || "").toLowerCase();
      const applications = await storage.getInstallerApplications({
        includeArchived: includeArchived === "1" || includeArchived === "true" || includeArchived === "yes",
      });
      res.json(applications);
    } catch (err) {
      console.error("[installer-applications] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/installer-applications/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });
      const { status, notes } = req.body || {};
      const patch: Record<string, string | null> = {};
      if (typeof status === "string") patch.status = status;
      if (typeof notes === "string") patch.notes = notes;
      const updated = await storage.updateInstallerApplication(id, patch);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("[installer-applications PATCH] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/installer-applications/:id/archive", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!(["admin", "sales_director", "install_director"].includes(actor?.role))) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const updated = await storage.archiveInstallerApplication(id);
      if (!updated) return res.status(404).json({ error: "Application introuvable" });

      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "installer_application_archived",
        note: `Application archivée: ${updated.contactName} (${updated.companyName})`,
      });

      res.json({ ok: true, archivedAt: updated.archivedAt });
    } catch (err) {
      console.error("[installer-applications/archive] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/installer-applications/:id/restore", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!(["admin", "sales_director", "install_director"].includes(actor?.role))) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const updated = await storage.restoreInstallerApplication(id);
      if (!updated) return res.status(404).json({ error: "Application introuvable" });

      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "installer_application_restored",
        note: `Application restaurée: ${updated.contactName} (${updated.companyName})`,
      });

      res.json({ ok: true, archivedAt: updated.archivedAt });
    } catch (err) {
      console.error("[installer-applications/restore] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Convert an installer application → create user account + send invite
  app.post("/api/installer-applications/:id/convert", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!["admin", "sales_director", "install_director"].includes(actor?.role)) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const app = await storage.getInstallerApplication(id);
      if (!app) return res.status(404).json({ error: "Application introuvable" });

      // Check if a user with this email already exists
      const existing = await storage.getUserByEmailWithHash(app.email);
      if (existing) {
        return res.status(409).json({ error: "Un compte existe déjà pour ce courriel." });
      }

      // Pre-fill from the submitted fiche when available so the heatmap and
      // territory fields of the installer record are populated automatically.
      let ficheParsed: any = null;
      if (app.ficheData) {
        try { ficheParsed = JSON.parse(app.ficheData); } catch { ficheParsed = null; }
      }
      const heatmapPostal = String(ficheParsed?.postalCodeHeatmap || "").trim();
      const ficheRegions = String(ficheParsed?.regions || "").trim();
      const region = heatmapPostal || ficheRegions || app.regions || null;
      // Build a cities JSON array from the regions string ("Montréal, Laval, Longueuil")
      const citiesArr = ficheRegions
        ? ficheRegions.split(/[,;|\/]+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const cities = citiesArr.length ? JSON.stringify(citiesArr) : null;

      // Create installer user
      const newUser = await storage.createUser({
        name: app.contactName,
        email: app.email,
        role: "installer",
        phone: app.phone,
        region,
        cities,
        active: true,
      });
      // Mark profile as already completed when fiche has been submitted —
      // they don't need to fill the in-app profile form again.
      await storage.setInstallerProfileCompleted(newUser.id, !!app.ficheCompletedAt);

      // Send invite
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await storage.setInviteToken(newUser.id, token, expiresAt);
      const baseUrl = process.env.APP_URL || "https://cloture-crm.onrender.com";
      const inviteUrl = `${baseUrl}/i/${token}`;
      const [emailResult, smsResult] = await Promise.all([
        sendInviteEmail(newUser.email, newUser.name, newUser.role, inviteUrl),
        sendInviteSms(newUser.phone ?? "", newUser.smsCarrier ?? "", newUser.name, newUser.role, inviteUrl),
      ]);

      // Mark application as approved
      await storage.updateInstallerApplication(id, { status: "approuve", notes: `Converti en compte installateur (userId: ${newUser.id}) le ${new Date().toLocaleDateString("fr-CA")}` });
      await storage.setInstallerApplicationConvertedUserId(id, newUser.id);

      res.json({
        ok: true,
        userId: newUser.id,
        inviteUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (err: any) {
      console.error("[installer-applications/convert] error", err);
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  // -------- Send fiche sous-traitant link to applicant (no account created) --------
  app.post("/api/installer-applications/:id/send-fiche", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!["admin", "sales_director", "install_director"].includes(actor?.role)) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const app = await storage.getInstallerApplication(id);
      if (!app) return res.status(404).json({ error: "Application introuvable" });

      // Reuse existing token if present, otherwise generate one
      const token = app.formToken || randomBytes(24).toString("hex");
      if (!app.formToken) {
        await storage.setInstallerApplicationFormToken(id, token);
      }

      const siteUrl = process.env.SITE_URL || "https://clotureimpress.com";
      const ficheUrl = `${siteUrl}/fiche-installateur.html?token=${token}`;

      const emailResult = await sendInstallerFicheLinkEmail(
        app.email,
        app.contactName,
        app.companyName,
        ficheUrl
      );

      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "installer_application_send_fiche",
        note: `Lien fiche sous-traitant envoye a ${app.contactName} (${app.email}) pour ${app.companyName}${emailResult.ok ? "" : ` - erreur: ${emailResult.error}`}`,
      });

      res.json({ ok: true, ficheUrl, emailSent: emailResult.ok, emailError: emailResult.error });
    } catch (err: any) {
      console.error("[installer-applications/send-fiche] error", err);
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  // -------- Public fiche endpoints (token-based, no auth) --------
  app.options("/api/public/installer-fiche/:token", (req, res) => {
    applyPublicCors(req, res);
    res.status(204).end();
  });
  app.get("/api/public/installer-fiche/:token", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const token = String(req.params.token || "");
      if (!token) return res.status(400).json({ error: "Token manquant" });
      const app = await storage.getInstallerApplicationByToken(token);
      if (!app) return res.status(404).json({ error: "Lien invalide ou expire" });

      let parsed: any = null;
      if (app.ficheData) {
        try { parsed = JSON.parse(app.ficheData); } catch { parsed = null; }
      }

      res.json({
        ok: true,
        application: {
          companyName: app.companyName,
          contactName: app.contactName,
          email: app.email,
          phone: app.phone,
          address: app.address,
          regions: app.regions,
        },
        data: parsed,
        completed: !!app.ficheCompletedAt,
      });
    } catch (err: any) {
      console.error("[public/installer-fiche GET] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
  app.post("/api/public/installer-fiche/:token", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const token = String(req.params.token || "");
      if (!token) return res.status(400).json({ error: "Token manquant" });
      const app = await storage.getInstallerApplicationByToken(token);
      if (!app) return res.status(404).json({ error: "Lien invalide ou expire" });

      const data = req.body?.data;
      if (!data || typeof data !== "object") {
        return res.status(400).json({ error: "Donnees invalides" });
      }
      const submitted = req.body?.submitted === true;

      const serialized = JSON.stringify(data);
      const completedAt = submitted
        ? new Date().toISOString()
        : (app.ficheCompletedAt || ""); // keep existing completion timestamp on auto-saves

      await storage.setInstallerApplicationFicheData(app.id, serialized, completedAt);

      if (submitted) {
        await storage.createActivity({
          userId: null,
          userName: app.contactName,
          userRole: "installer_applicant",
          action: "installer_application_fiche_submitted",
          note: `Fiche sous-traitant soumise par ${app.contactName} (${app.email}) pour ${app.companyName}`,
        });
      }

      res.json({ ok: true, submitted });
    } catch (err: any) {
      console.error("[public/installer-fiche POST] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // -------- Public representative application --------
  app.options("/api/public/representative-application", (req, res) => {
    applyPublicCors(req, res);
    res.status(204).end();
  });
  app.post("/api/public/representative-application", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const b = req.body || {};
      if (b.website_url) return res.json({ ok: true });

      const parsed = insertRepresentativeApplicationSchema.parse({
        companyName: String(b.companyName || "").trim(),
        website: String(b.website || "").trim() || null,
        address: String(b.address || "").trim() || null,
        yearFounded: String(b.yearFounded || "").trim() || null,
        employeeCount: String(b.employeeCount || "").trim() || null,
        regions: String(b.regions || "").trim() || null,
        contactName: String(b.contactName || "").trim(),
        phone: String(b.phone || "").trim(),
        email: String(b.email || "").trim(),
        yearsExperience: String(b.yearsExperience || "").trim() || null,
        salesExperience: String(b.salesExperience || "").trim() || null,
        preferredMarket: String(b.preferredMarket || "").trim() || null,
        status: "en_attente",
        notes: null,
      });

      if (!parsed.companyName || !parsed.contactName || !parsed.phone || !parsed.email) {
        return res.status(400).json({ error: "Champs obligatoires manquants." });
      }

      const application = await storage.createRepresentativeApplication(parsed);
      return res.json({ ok: true, id: application.id });
    } catch (err: any) {
      console.error("[public/representative-application] error", err);
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  app.get("/api/representative-applications", requireAuth, async (req, res) => {
    try {
      const includeArchived = String(req.query.archived || "").toLowerCase();
      const applications = await storage.getRepresentativeApplications({
        includeArchived: includeArchived === "1" || includeArchived === "true" || includeArchived === "yes",
      });
      res.json(applications);
    } catch (err) {
      console.error("[representative-applications] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/representative-applications/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });
      const { status, notes } = req.body || {};
      const patch: Record<string, string | null> = {};
      if (typeof status === "string") patch.status = status;
      if (typeof notes === "string") patch.notes = notes;
      const updated = await storage.updateRepresentativeApplication(id, patch);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("[representative-applications PATCH] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/representative-applications/:id/archive", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!( ["admin", "sales_director", "install_director"].includes(actor?.role) )) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });
      const updated = await storage.archiveRepresentativeApplication(id);
      if (!updated) return res.status(404).json({ error: "Application introuvable" });
      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "representative_application_archived",
        note: `Application representant archivee: ${updated.contactName} (${updated.companyName})`,
      });
      res.json({ ok: true, archivedAt: updated.archivedAt });
    } catch (err) {
      console.error("[representative-applications/archive] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/representative-applications/:id/restore", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!( ["admin", "sales_director", "install_director"].includes(actor?.role) )) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });
      const updated = await storage.restoreRepresentativeApplication(id);
      if (!updated) return res.status(404).json({ error: "Application introuvable" });
      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "representative_application_restored",
        note: `Application representant restauree: ${updated.contactName} (${updated.companyName})`,
      });
      res.json({ ok: true, archivedAt: updated.archivedAt });
    } catch (err) {
      console.error("[representative-applications/restore] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/representative-applications/:id/convert", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!(["admin", "sales_director", "install_director"].includes(actor?.role))) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const app = await storage.getRepresentativeApplication(id);
      if (!app) return res.status(404).json({ error: "Application introuvable" });

      const existing = await storage.getUserByEmailWithHash(app.email);
      if (existing) {
        return res.status(409).json({ error: "Un compte existe deja pour ce courriel." });
      }

      let ficheParsed: any = null;
      if (app.ficheData) {
        try { ficheParsed = JSON.parse(app.ficheData); } catch { ficheParsed = null; }
      }
      const region = String(ficheParsed?.regions || "").trim() || app.regions || null;
      const citiesArr = region ? region.split(/[,;|\/]+/).map((s: string) => s.trim()).filter(Boolean) : [];
      const cities = citiesArr.length ? JSON.stringify(citiesArr) : null;

      const newUser = await storage.createUser({
        name: app.contactName,
        email: app.email,
        role: "sales_rep",
        phone: app.phone,
        region,
        cities,
        active: true,
      });

      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await storage.setInviteToken(newUser.id, token, expiresAt);
      const baseUrl = process.env.APP_URL || "https://cloture-crm.onrender.com";
      const inviteUrl = `${baseUrl}/i/${token}`;
      const [emailResult, smsResult] = await Promise.all([
        sendInviteEmail(newUser.email, newUser.name, newUser.role, inviteUrl),
        sendInviteSms(newUser.phone ?? "", newUser.smsCarrier ?? "", newUser.name, newUser.role, inviteUrl),
      ]);

      await storage.updateRepresentativeApplication(id, { status: "approuve", notes: `Converti en compte representant (userId: ${newUser.id}) le ${new Date().toLocaleDateString("fr-CA")}` });
      await storage.setRepresentativeApplicationConvertedUserId(id, newUser.id);

      res.json({
        ok: true,
        userId: newUser.id,
        inviteUrl,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
        smsSent: smsResult.ok,
        smsError: smsResult.error,
      });
    } catch (err: any) {
      console.error("[representative-applications/convert] error", err);
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  app.post("/api/representative-applications/:id/send-fiche", requireAuth, async (req, res) => {
    try {
      const actor = req.user as any;
      if (!(["admin", "sales_director", "install_director"].includes(actor?.role))) {
        return res.status(403).json({ error: "Acces refuse" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const app = await storage.getRepresentativeApplication(id);
      if (!app) return res.status(404).json({ error: "Application introuvable" });

      const token = app.formToken || randomBytes(24).toString("hex");
      if (!app.formToken) {
        await storage.setRepresentativeApplicationFormToken(id, token);
      }

      const siteUrl = process.env.SITE_URL || "https://clotureimpress.com";
      const ficheUrl = `${siteUrl}/fiche-representant.html?token=${token}`;
      const emailResult = await sendRepresentativeFicheLinkEmail(app.email, app.contactName, app.companyName, ficheUrl);

      await storage.createActivity({
        userId: actor?.id || null,
        userName: actor?.name || "Admin",
        userRole: actor?.role || "admin",
        action: "representative_application_send_fiche",
        note: `Lien fiche representant envoye a ${app.contactName} (${app.email}) pour ${app.companyName}${emailResult.ok ? "" : ` - erreur: ${emailResult.error}`}`,
      });

      res.json({ ok: true, ficheUrl, emailSent: emailResult.ok, emailError: emailResult.error });
    } catch (err: any) {
      console.error("[representative-applications/send-fiche] error", err);
      res.status(500).json({ error: err?.message || "Erreur serveur" });
    }
  });

  app.options("/api/public/representative-fiche/:token", (req, res) => {
    applyPublicCors(req, res);
    res.status(204).end();
  });
  app.get("/api/public/representative-fiche/:token", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const token = String(req.params.token || "");
      if (!token) return res.status(400).json({ error: "Token manquant" });
      const app = await storage.getRepresentativeApplicationByToken(token);
      if (!app) return res.status(404).json({ error: "Lien invalide ou expire" });

      let parsed: any = null;
      if (app.ficheData) {
        try { parsed = JSON.parse(app.ficheData); } catch { parsed = null; }
      }

      res.json({
        ok: true,
        application: {
          companyName: app.companyName,
          contactName: app.contactName,
          email: app.email,
          phone: app.phone,
          address: app.address,
          regions: app.regions,
        },
        data: parsed,
        completed: !!app.ficheCompletedAt,
      });
    } catch (err: any) {
      console.error("[public/representative-fiche GET] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
  app.post("/api/public/representative-fiche/:token", async (req, res) => {
    applyPublicCors(req, res);
    try {
      const token = String(req.params.token || "");
      if (!token) return res.status(400).json({ error: "Token manquant" });
      const app = await storage.getRepresentativeApplicationByToken(token);
      if (!app) return res.status(404).json({ error: "Lien invalide ou expire" });

      const data = req.body?.data;
      if (!data || typeof data !== "object") {
        return res.status(400).json({ error: "Donnees invalides" });
      }
      const submitted = req.body?.submitted === true;

      const serialized = JSON.stringify(data);
      const completedAt = submitted ? new Date().toISOString() : (app.ficheCompletedAt || "");
      await storage.setRepresentativeApplicationFicheData(app.id, serialized, completedAt);

      if (submitted) {
        await storage.createActivity({
          userId: null,
          userName: app.contactName,
          userRole: "representative_applicant",
          action: "representative_application_fiche_submitted",
          note: `Fiche representant soumise par ${app.contactName} (${app.email}) pour ${app.companyName}`,
        });
      }

      res.json({ ok: true, submitted });
    } catch (err: any) {
      console.error("[public/representative-fiche POST] error", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // -------- Sector detection helper --------
  app.post("/api/sector/detect", (req, res) => {
    res.json({ sector: detectSector(req.body || {}) });
  });

  // -------- Intimura credentials (persisted on disk) --------
  // Three ways to authenticate against Cloudflare Access in front of Intimura:
  //  1) Bookmarklet token (recommended): user logs in on intimura.com and clicks a
  //     bookmarklet that fetches data with their browser session and POSTs it back here.
  //  2) Paste a browser session cookie (typically `CF_Authorization=...`) - lasts ~24h.
  //  3) Configure a Cloudflare Access Service Token (Client-Id + Client-Secret) - never expires.
  const intimuraCredsDir = path.join(process.cwd(), ".intimura");
  const intimuraCredsPath = path.join(intimuraCredsDir, "credentials.json");
  type IntimuraCreds = { cookie?: string; cfClientId?: string; cfClientSecret?: string; bookmarkletToken?: string; updatedAt?: string };
  function readIntimuraCreds(): IntimuraCreds {
    try {
      if (existsSync(intimuraCredsPath)) return JSON.parse(readFileSync(intimuraCredsPath, "utf8")) as IntimuraCreds;
    } catch { /* ignore */ }
    return {};
  }
  function writeIntimuraCreds(creds: IntimuraCreds) {
    try { mkdirSync(intimuraCredsDir, { recursive: true }); } catch { /* ignore */ }
    writeFileSync(intimuraCredsPath, JSON.stringify({ ...creds, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  }
  function ensureBookmarkletToken(): string {
    // Prefer an explicit env var so it stays stable across Render deploys
    // (Render's filesystem is ephemeral, so a randomly generated token would
    // rotate on every deploy and break the bookmarklet).
    const envToken = process.env.INTIMURA_BOOKMARKLET_TOKEN || "";
    if (envToken && envToken.length >= 32) return envToken;
    const creds = readIntimuraCreds();
    if (creds.bookmarkletToken && creds.bookmarkletToken.length >= 32) return creds.bookmarkletToken;
    // Derive a deterministic token from SESSION_SECRET so it survives deploys
    // even without dedicated config (the secret itself stays the same).
    if (process.env.SESSION_SECRET) {
      const derived = createHash("sha256")
        .update("intimura-bookmarklet-v1:" + process.env.SESSION_SECRET)
        .digest("hex")
        .slice(0, 48);
      writeIntimuraCreds({ ...creds, bookmarkletToken: derived });
      return derived;
    }
    const token = randomBytes(24).toString("hex");
    writeIntimuraCreds({ ...creds, bookmarkletToken: token });
    return token;
  }
  function buildIntimuraHeaders(): Record<string, string> | null {
    const creds = readIntimuraCreds();
    const cookie = process.env.INTIMURA_COOKIE || creds.cookie || "";
    const cfClientId = process.env.CF_ACCESS_CLIENT_ID || creds.cfClientId || "";
    const cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || creds.cfClientSecret || "";
    if (!cookie && !(cfClientId && cfClientSecret)) return null;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cookie) headers["Cookie"] = cookie;
    if (cfClientId && cfClientSecret) {
      headers["CF-Access-Client-Id"] = cfClientId;
      headers["CF-Access-Client-Secret"] = cfClientSecret;
    }
    return headers;
  }

  function canUseIntimuraBookmarklet(role: string | undefined) {
    return role === "admin" || role === "sales_director";
  }

  app.get("/api/intimura/credentials", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (!canUseIntimuraBookmarklet(actor?.role)) {
      return res.status(403).json({ error: "Acces reserve aux administrateurs et directeurs des ventes" });
    }
    const creds = readIntimuraCreds();
    const token = ensureBookmarkletToken();
    const isAdmin = actor?.role === "admin";
    const hasServerCredentials = !!(
      process.env.INTIMURA_COOKIE ||
      creds.cookie ||
      ((process.env.CF_ACCESS_CLIENT_ID || creds.cfClientId) &&
        (process.env.CF_ACCESS_CLIENT_SECRET || creds.cfClientSecret))
    );
    res.json({
      hasServerCredentials,
      hasCookie: isAdmin ? !!(process.env.INTIMURA_COOKIE || creds.cookie) : undefined,
      hasCfServiceToken: isAdmin
        ? !!((process.env.CF_ACCESS_CLIENT_ID || creds.cfClientId) && (process.env.CF_ACCESS_CLIENT_SECRET || creds.cfClientSecret))
        : undefined,
      bookmarkletToken: token,
      updatedAt: creds.updatedAt || null,
    });
  });

  app.post("/api/intimura/credentials", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (actor?.role !== "admin") return res.status(403).json({ error: "Acces admin requis" });
    const { cookie, cfClientId, cfClientSecret, clear } = req.body || {};
    if (clear) {
      writeIntimuraCreds({});
      return res.json({ ok: true, cleared: true });
    }
    const current = readIntimuraCreds();
    writeIntimuraCreds({
      cookie: typeof cookie === "string" && cookie.trim() ? cookie.trim() : current.cookie,
      cfClientId: typeof cfClientId === "string" && cfClientId.trim() ? cfClientId.trim() : current.cfClientId,
      cfClientSecret: typeof cfClientSecret === "string" && cfClientSecret.trim() ? cfClientSecret.trim() : current.cfClientSecret,
    });
    res.json({ ok: true });
  });

  function intimuraQuoteUrl(intimuraId: string) {
    return `https://crm.intimura.com/app/quotes/${intimuraId}`;
  }

  async function createQuoteFromIntimuraRow(lead: any, iq: any) {
    const city = extractCity(iq.title || "") || lead.city;
    const province = inferProvince(city || String(lead.province || ""));
    const salesStatus = mapIntimuraStatus(iq.status);
    const url = intimuraQuoteUrl(iq.id);
    return storage.createQuote({
      leadId: lead.id,
      intimuraId: iq.id,
      clientName: lead.clientName,
      address: lead.address,
      city,
      province,
      sector: lead.sector,
      status: salesStatus === "signee" ? "signee" : "envoyee",
      salesStatus,
      installStatus: "a_planifier",
      assignedSalesId: lead.assignedSalesId ?? null,
      assignedInstallerId: null,
      fenceType: lead.fenceType || "À confirmer",
      estimatedLength: lead.estimatedLength,
      estimatedPrice: Number(iq.subtotal || lead.estimatedValue || 0),
      finalPrice: null,
      salesNotes: `Import Intimura ${iq.id}.\nLien fiche: ${url}`,
      installNotes: iq.with_installation ? "Installation demandée dans Intimura." : null,
      scheduledDate: iq.target_date || null,
      signedDate: salesStatus === "signee" ? iq.issued_at || null : null,
      installedDate: null,
      paidDate: iq.first_payment_paid_at || null,
      timeline: JSON.stringify([
        { step: "Import Intimura", date: new Date().toISOString(), note: url },
        { step: "Statut Intimura", date: iq.created_at || new Date().toISOString(), note: iq.status || "" },
      ]),
    });
  }

  function queueIntimuraDetailFetch(queue: string[], intimuraId: string, quote: any | undefined | null) {
    if (!intimuraId || !quote || quote.intimuraData) return;
    if (!queue.includes(intimuraId)) queue.push(intimuraId);
  }

  // Shared importer used by /api/intimura/sync (server-side fetch) and
  // /api/intimura/ingest (client-side push from bookmarklet).
  async function importIntimuraQuotes(
    intimuraQuotes: any[],
    opts?: { runPostDedup?: boolean },
  ) {
    let createdLeads = 0;
    let createdQuotes = 0;
    let skipped = 0;
    const createdIntimuraIds: string[] = [];
    const detailIntimuraIds: string[] = [];

    const allQuotes = await storage.getQuotes();
    const quoteByIntimuraId = new Map<string, (typeof allQuotes)[number]>();
    const quotesByLeadId = new Map<number, (typeof allQuotes)[number][]>();
    for (const q of allQuotes) {
      if (q.intimuraId) quoteByIntimuraId.set(q.intimuraId, q);
      if (q.leadId != null) {
        const arr = quotesByLeadId.get(q.leadId) || [];
        arr.push(q);
        quotesByLeadId.set(q.leadId, arr);
      }
    }

    // Pre-load all leads once to enable robust secondary dedup when the
    // Intimura quote id differs (bookmarklet row vs API row).
    const allLeads = await storage.getLeads();
    const normName = (s: string) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const normPhone = (s: string) => String(s || "").replace(/\D+/g, "").slice(-10);
    const normEmail = (s: string) => String(s || "").trim().toLowerCase();
    // First two tokens + first/last token key to absorb variants like
    // "RICHARD BOUTIN x Saint-Pamphile" vs "RICHARD BOUTIN".
    const nameKey = (s: string) => normName(s).split(" ").slice(0, 2).join(" ");
    const personKey = (s: string) => {
      const cleaned = normName(s).split(/\bx\b/)[0].trim();
      const tokens = cleaned.split(" ").filter(Boolean);
      if (!tokens.length) return "";
      if (tokens.length === 1) return tokens[0];
      return `${tokens[0]} ${tokens[tokens.length - 1]}`;
    };
    const sameZone = (a: any, city: string, province: string) => {
      const aCity = String(a?.city || "").trim().toLowerCase();
      const cCity = String(city || "").trim().toLowerCase();
      const aProv = String(a?.province || "").trim().toUpperCase();
      const cProv = String(province || "").trim().toUpperCase();
      const cityOk = !aCity || !cCity || aCity === cCity;
      const provOk = !aProv || !cProv || aProv === cProv;
      return cityOk && provOk;
    };

    const byNameKey = new Map<string, Array<typeof allLeads[number]>>();
    const byPersonKey = new Map<string, Array<typeof allLeads[number]>>();
    const byPhone = new Map<string, Array<typeof allLeads[number]>>();
    const byEmail = new Map<string, Array<typeof allLeads[number]>>();
    const pushMap = <T>(m: Map<string, T[]>, k: string, v: T) => {
      if (!k) return;
      const arr = m.get(k);
      if (arr) arr.push(v); else m.set(k, [v]);
    };
    for (const l of allLeads) {
      const k = nameKey(l.clientName || "");
      pushMap(byNameKey, k, l);
      pushMap(byPersonKey, personKey(l.clientName || ""), l);
      const p = normPhone(l.phone || "");
      if (p && p.length >= 10) pushMap(byPhone, p, l);
      const e = normEmail(l.email || "");
      if (e) pushMap(byEmail, e, l);
    }

    const pickBestDuplicate = (candName: string, candPhoneKey: string, candEmailKey: string, city: string, province: string) => {
      const direct = [
        ...(candPhoneKey && candPhoneKey.length >= 10 ? (byPhone.get(candPhoneKey) || []) : []),
        ...(candEmailKey ? (byEmail.get(candEmailKey) || []) : []),
      ];
      const seen = new Set<number>();
      const fuzzy = [
        ...(byPersonKey.get(personKey(candName)) || []),
        ...(byNameKey.get(nameKey(candName)) || []),
      ];
      const all = [...direct, ...fuzzy].filter((l) => {
        if (!l || seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
      if (!all.length) return undefined;

      // Direct (phone/email) matches are STRONG signals — never gate on zone.
      // Only fuzzy name-only matches require zone agreement to avoid false merges.
      const directSet = new Set(direct.filter(Boolean).map((l) => l!.id));
      const scored = all
        .filter((l) => directSet.has(l.id) || sameZone(l, city, province))
        .sort((a, b) => {
          const sa = (directSet.has(a.id) ? 1000 : 0) + (a.assignedSalesId ? 100 : 0) + (a.intimuraId ? 20 : 0) + (a.source !== "intimura" ? 10 : 0);
          const sb = (directSet.has(b.id) ? 1000 : 0) + (b.assignedSalesId ? 100 : 0) + (b.intimuraId ? 20 : 0) + (b.source !== "intimura" ? 10 : 0);
          return sb - sa;
        });
      return scored[0] || all[0];
    };

    const LEAD_CUTOFF = '2026-05-01';
    for (const iq of intimuraQuotes) {
      if (!iq?.id) continue;
      // Ignorer les leads Intimura antérieurs au 2026-05-01
      if (iq.created_at && String(iq.created_at).slice(0, 10) < LEAD_CUTOFF) {
        skipped++;
        continue;
      }
      const existingLead = await storage.getLeadByIntimuraId(iq.id);
      let existingQuote = quoteByIntimuraId.get(iq.id);
      if (existingLead || existingQuote) {
        skipped++;
        if (existingLead && !existingQuote) {
          existingQuote = await createQuoteFromIntimuraRow(existingLead, iq);
          createdQuotes++;
          quoteByIntimuraId.set(iq.id, existingQuote);
          const lq = quotesByLeadId.get(existingLead.id) || [];
          lq.push(existingQuote);
          quotesByLeadId.set(existingLead.id, lq);
        } else if (existingLead && existingQuote && !existingQuote.leadId) {
          try {
            await storage.updateQuote(existingQuote.id, { leadId: existingLead.id } as any);
            existingQuote = { ...existingQuote, leadId: existingLead.id };
          } catch {}
        }
        queueIntimuraDetailFetch(detailIntimuraIds, iq.id, existingQuote);
        continue;
      }

      // Secondary dedup: same person already exists under another Intimura id
      const city = extractCity(iq.title || "");
      const province = inferProvince(city);
      const candName = iq.customer_name || iq.title || "";
      const candPhoneKey = normPhone(iq.customer_phone || "");
      const candEmailKey = normEmail(iq.customer_email || "");
      const dupe = pickBestDuplicate(candName, candPhoneKey, candEmailKey, city, province);
      if (dupe) {
        // Backfill intimuraId on the existing lead so future syncs match by id directly.
        if (!dupe.intimuraId) {
          try { await storage.updateLead(dupe.id, { intimuraId: iq.id }); } catch {}
        }

        // If there are stale unassigned duplicates for the same person,
        // copy the known seller assignment so they stop reappearing in
        // "Leads à assigner".
        if (dupe.assignedSalesId) {
          const pk = personKey(candName);
          const stale = byPersonKey.get(pk) || [];
          for (const s of stale) {
            if (s.id === dupe.id) continue;
            if (s.assignedSalesId) continue;
            if (!sameZone(s, city, province)) continue;
            try {
              await storage.updateLead(s.id, {
                assignedSalesId: dupe.assignedSalesId,
                status: s.status === "nouveau" ? "assigne" : s.status,
              });
              s.assignedSalesId = dupe.assignedSalesId;
            } catch {}
          }
        }

        let linkedQuote =
          quoteByIntimuraId.get(iq.id) ||
          (quotesByLeadId.get(dupe.id) || []).find((q) => q.intimuraId === iq.id) ||
          (quotesByLeadId.get(dupe.id) || [])[0];
        if (!linkedQuote) {
          linkedQuote = await createQuoteFromIntimuraRow(dupe, iq);
          createdQuotes++;
          quoteByIntimuraId.set(iq.id, linkedQuote);
          const lq = quotesByLeadId.get(dupe.id) || [];
          lq.push(linkedQuote);
          quotesByLeadId.set(dupe.id, lq);
        }
        queueIntimuraDetailFetch(detailIntimuraIds, iq.id, linkedQuote);
        skipped++;
        continue;
      }
      const salesStatus = mapIntimuraStatus(iq.status);
      const intimuraUrl = intimuraQuoteUrl(iq.id);
      const lead = await storage.createLead({
        clientName: iq.customer_name || iq.title || "Client Intimura",
        phone: iq.customer_phone || null,
        email: iq.customer_email || null,
        address: null,
        city,
        province,
        postalCode: null,
        neighborhood: city,
        fenceType: "À confirmer",
        message: `Synchronisé depuis Intimura. Titre: ${iq.title || ""}. Statut Intimura: ${iq.status || ""}. Assigné: ${iq.assigned_user_name || ""}.`,
        source: "intimura",
        intimuraId: iq.id,
        status: salesStatus === "signee" ? "gagne" : "en_cours",
        assignedSalesId: null,
        estimatedValue: Number(iq.subtotal || 0),
        estimatedLength: null,
      });
      createdLeads++;

      // Keep in-memory indexes fresh to avoid duplicates within the same payload.
      pushMap(byNameKey, nameKey(lead.clientName || ""), lead as any);
      pushMap(byPersonKey, personKey(lead.clientName || ""), lead as any);
      const lp = normPhone(lead.phone || "");
      if (lp && lp.length >= 10) pushMap(byPhone, lp, lead as any);
      const le = normEmail(lead.email || "");
      if (le) pushMap(byEmail, le, lead as any);

      const newQuote = await storage.createQuote({
        leadId: lead.id,
        intimuraId: iq.id,
        clientName: lead.clientName,
        address: null,
        city,
        province,
        sector: lead.sector,
        status: salesStatus === "signee" ? "signee" : "envoyee",
        salesStatus,
        installStatus: "a_planifier",
        assignedSalesId: null,
        assignedInstallerId: null,
        fenceType: "À confirmer",
        estimatedLength: null,
        estimatedPrice: Number(iq.subtotal || 0),
        finalPrice: null,
        salesNotes: `Import Intimura ${iq.id}.\nLien fiche: ${intimuraUrl}\nPremier paiement: ${iq.first_payment_amount || "n/d"}.`,
        installNotes: iq.with_installation ? "Installation demandée dans Intimura." : null,
        scheduledDate: iq.target_date || null,
        signedDate: salesStatus === "signee" ? iq.issued_at || null : null,
        installedDate: null,
        paidDate: iq.first_payment_paid_at || null,
        timeline: JSON.stringify([
          { step: "Import Intimura", date: new Date().toISOString(), note: intimuraUrl },
          { step: "Statut Intimura", date: iq.created_at || new Date().toISOString(), note: iq.status || "" },
        ]),
      });
      createdQuotes++;
      createdIntimuraIds.push(iq.id);
      quoteByIntimuraId.set(iq.id, newQuote);
      const lq = quotesByLeadId.get(lead.id) || [];
      lq.push(newQuote);
      quotesByLeadId.set(lead.id, lq);

      await storage.createActivity({
        leadId: lead.id,
        userId: null,
        userName: "Sync Intimura",
        userRole: "system",
        action: "intimura_sync",
        note: `Lead importé depuis Intimura: ${iq.title || iq.customer_name}`,
      });
    }

    // Optional post-import dedup (server cron / admin sync only — bookmarklet skips this).
    let dedupedAfterImport = 0;
    let dedupedQuotesAfterImport = 0;
    if (opts?.runPostDedup !== false && createdLeads > 0) {
      try {
        const d = await dedupAllLeads();
        dedupedAfterImport = d.mergedCount;
      } catch (e) {
        console.error("[intimura import] dedup leads pass failed", e);
      }
      try {
        const dq = await dedupAllQuotes();
        dedupedQuotesAfterImport = dq.mergedCount;
      } catch (e) {
        console.error("[intimura import] dedup quotes pass failed", e);
      }
    }
    return {
      fetched: intimuraQuotes.length,
      createdLeads,
      createdQuotes,
      skipped,
      createdIntimuraIds,
      detailIntimuraIds,
      dedupedAfterImport,
      dedupedQuotesAfterImport,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Global dedup pass over ALL leads. Walks rows in id-ascending order; the
   * earliest lead wins. Strong matches (intimuraId / phone / email) merge
   * unconditionally. Fuzzy person-key match merges only when both sides are
   * Intimura-sourced AND the duplicate has no contact info to lose.
   * Idempotent: re-running on a clean DB does nothing.
   */
  async function dedupAllLeads(): Promise<{ mergedCount: number; merged: Array<{ removed: number; into: number; reason: string }>; }> {
    const allLeads = (await storage.getLeads()).slice().sort((a, b) => a.id - b.id);
    const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const personKey = (s: string) => {
      const cleaned = norm(s).split(/\bx\b/)[0].trim();
      const tokens = cleaned.split(" ").filter(Boolean);
      if (!tokens.length) return "";
      if (tokens.length === 1) return tokens[0];
      return `${tokens[0]} ${tokens[tokens.length - 1]}`;
    };
    const phoneKey = (s: string) => {
      const d = String(s || "").replace(/\D+/g, "");
      const t = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
      return t.length === 10 ? t : "";
    };
    const emailKey = (s: string) => String(s || "").trim().toLowerCase();

    const keepers = new Map<string, number>(); // composite key -> keeper lead id
    const canonical = new Map<number, number>(); // lead id -> current canonical id (after merges)
    const canon = (id: number): number => {
      let cur = id;
      const seen = new Set<number>();
      while (canonical.has(cur) && canonical.get(cur) !== cur && !seen.has(cur)) {
        seen.add(cur);
        cur = canonical.get(cur)!;
      }
      return cur;
    };
    const merged: Array<{ removed: number; into: number; reason: string }> = [];

    for (const l of allLeads) {
      const intK = l.intimuraId ? `int:${l.intimuraId}` : "";
      const phK = phoneKey(l.phone || "");
      const emK = emailKey(l.email || "");
      const pkK = personKey(l.clientName || "");
      const isIntSource = (l.source || "") === "intimura";

      // Keys we will USE for matching against earlier leads.
      const matchChecks: Array<{ type: string; key: string }> = [];
      if (intK) matchChecks.push({ type: "intimuraId", key: intK });
      if (phK) matchChecks.push({ type: "phone", key: `ph:${phK}` });
      if (emK) matchChecks.push({ type: "email", key: `em:${emK}` });
      // Person-key fallback: only match when the CURRENT lead is a contact-less
      // Intimura stub. This catches the recurring case where Intimura emits a
      // fresh quote id with empty phone/email for an already-known customer.
      const allowPkMatch = isIntSource && !phK && !emK && !!pkK;
      if (allowPkMatch) matchChecks.push({ type: "name+intimura", key: `pk:${pkK}` });

      let target: number | undefined;
      let reason = "";
      for (const { type, key } of matchChecks) {
        const existing = keepers.get(key);
        if (existing != null && existing !== l.id) {
          target = canon(existing);
          reason = type;
          break;
        }
      }

      if (target != null && target !== l.id) {
        try {
          const ok = await storage.mergeLeadInto(l.id, target);
          if (ok) {
            canonical.set(l.id, target);
            merged.push({ removed: l.id, into: target, reason });
            // Re-register every key under the keeper so subsequent rows resolve to it.
            for (const { key } of matchChecks) keepers.set(key, target);
            // Always re-register the keeper's person key so later stubs find it.
            if (isIntSource && pkK) keepers.set(`pk:${pkK}`, target);
          }
        } catch (e) {
          console.error("[dedup] merge failed", l.id, "->", target, e);
        }
        continue;
      }

      // No duplicate yet. Register strong keys, AND always register the
      // person-key for Intimura-sourced leads so future stubs can match them.
      const registerChecks = [...matchChecks];
      if (isIntSource && pkK && !allowPkMatch) {
        registerChecks.push({ type: "name+intimura", key: `pk:${pkK}` });
      }
      for (const { key } of registerChecks) {
        if (!keepers.has(key)) keepers.set(key, l.id);
      }
    }

    return { mergedCount: merged.length, merged };
  }

  function extractIntimuraQuotes(payload: any): any[] {
    if (!payload) return [];
    let arr: any[] = [];
    if (Array.isArray(payload)) arr = payload;
    else if (Array.isArray(payload.quotes)) arr = payload.quotes;
    else if (payload.nodes) {
      const node = payload.nodes.find((n: any) => n?.type === "data");
      const root = node?.data ? decodeSvelteData(node.data) : null;
      if (Array.isArray(root?.quotes)) arr = root.quotes;
    }
    if (!arr.length) return [];

    // Normalize. Items may already be Intimura-shaped ({id,title,status,...})
    // or scraped rows from the bookmarklet (header-based keys + _id/_href).
    const pickKey = (row: any, ...keys: string[]) => {
      for (const k of keys) {
        for (const rk of Object.keys(row)) {
          if (rk.toLowerCase() === k.toLowerCase() && row[rk] != null && String(row[rk]).trim() !== "") {
            return String(row[rk]).trim();
          }
        }
      }
      return "";
    };
    const parseMoney = (s: string) => {
      if (!s) return 0;
      const cleaned = s.replace(/[^0-9.,-]/g, "").replace(/\s/g, "");
      const num = Number(cleaned.replace(/,/g, "."));
      return isFinite(num) ? num : 0;
    };

    return arr.map((row: any) => {
      // Already-shaped Intimura record
      if (row && typeof row === "object" && row.id && (row.title || row.customer_name || row.status)) {
        return row;
      }
      // Scraped row: derive id, title, status, etc. from common header names (FR + EN)
      const id =
        pickKey(row, "_id", "id", "quote_id", "numero", "no", "#") ||
        (row?._href ? String(row._href).split(/[\/?#]/).filter(Boolean).pop() : "") ||
        "";
      const title = pickKey(row, "title", "titre", "name", "nom", "project", "projet");
      const customer_name = pickKey(row, "customer", "client", "customer_name", "nom du client");
      const status = pickKey(row, "status", "statut", "etat", "état");
      const assigned_user_name = pickKey(row, "assigned to", "assigne", "assigné", "assigned_user_name", "owner", "vendeur", "salesperson");
      const subtotal = String(parseMoney(pickKey(row, "subtotal", "sous-total", "total", "amount", "montant", "price", "prix")));
      const date = pickKey(row, "date", "created", "created_at", "issued_at", "issued");
      return {
        id,
        title: title || customer_name || `Intimura ${id}`,
        customer_name,
        status,
        assigned_user_name,
        subtotal,
        target_date: date || null,
        created_at: date || null,
      };
    }).filter((q: any) => q && q.id);
  }

  /**
   * Global dedup pass over ALL quotes. Groups by leadId; the highest-id quote
   * wins (newest), all others are merged into it (fields backfilled, activities
   * repointed, dup quote deleted). Quotes with null leadId are left alone.
   * Idempotent.
   */
  async function dedupAllQuotes(): Promise<{ mergedCount: number; merged: Array<{ removed: number; into: number }>; }> {
    const allQuotes = await storage.getQuotes();
    const byLead = new Map<number, typeof allQuotes>();
    for (const q of allQuotes) {
      if (q.leadId == null) continue;
      const arr = byLead.get(q.leadId) || [];
      arr.push(q);
      byLead.set(q.leadId, arr);
    }
    const merged: Array<{ removed: number; into: number }> = [];
    for (const [, arr] of byLead) {
      if (arr.length < 2) continue;
      // Keep highest id (newest). Sort desc.
      arr.sort((a, b) => b.id - a.id);
      const keeper = arr[0];
      for (let i = 1; i < arr.length; i++) {
        const dup = arr[i];
        try {
          const ok = await (storage as any).mergeQuoteInto(dup.id, keeper.id);
          if (ok) merged.push({ removed: dup.id, into: keeper.id });
        } catch (e) {
          console.error("[dedup quotes] merge failed", dup.id, "->", keeper.id, e);
        }
      }
    }
    return { mergedCount: merged.length, merged };
  }

  type IntimuraAutoSyncState = {
    lastAt: string | null;
    lastOk: boolean;
    lastResult: any;
    lastError: string | null;
  };

  function getIntimuraAutoSyncState(): IntimuraAutoSyncState {
    const g = globalThis as any;
    if (!g.__intimuraAutoSyncState) {
      g.__intimuraAutoSyncState = { lastAt: null, lastOk: true, lastResult: null, lastError: null };
    }
    return g.__intimuraAutoSyncState as IntimuraAutoSyncState;
  }

  let intimuraSyncInProgress = false;

  async function fetchIntimuraSvelteJson(path: string, headers: Record<string, string>) {
    const r = await fetch(`https://crm.intimura.com${path}`, { headers });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return {
        ok: false as const,
        status: r.status,
        looksLikeCfLogin:
          body.includes("Cloudflare Access") || body.includes("cf-access") || r.status === 302,
      };
    }
    return { ok: true as const, payload: (await r.json()) as any };
  }

  /** Liste complete des quotes (page /app/quotes), avec repli sur le board kanban. */
  async function fetchIntimuraQuotesFromApi(headers: Record<string, string>) {
    const urls = [
      "/app/quotes/__data.json?x-sveltekit-invalidated=001",
      "/app/board/__data.json?x-sveltekit-invalidated=001",
    ];
    const byId = new Map<string, any>();
    let lastError: { status: number; looksLikeCfLogin: boolean } | null = null;

    for (const path of urls) {
      const res = await fetchIntimuraSvelteJson(path, headers);
      if (!res.ok) {
        lastError = { status: res.status, looksLikeCfLogin: res.looksLikeCfLogin };
        continue;
      }
      for (const q of extractIntimuraQuotes(res.payload)) {
        if (q?.id && !byId.has(q.id)) byId.set(q.id, q);
      }
    }

    if (!byId.size) {
      if (lastError?.looksLikeCfLogin) {
        return {
          ok: false as const,
          error: "INTIMURA_AUTH_EXPIRED" as const,
          message: "La session Cloudflare Access a expire. Renouvelle le cookie ou le service token.",
        };
      }
      return {
        ok: false as const,
        error: "INTIMURA_EMPTY" as const,
        message: lastError
          ? `Intimura HTTP ${lastError.status} — aucune soumission recue.`
          : "Aucune soumission Intimura trouvee dans l'API.",
      };
    }

    return { ok: true as const, quotes: [...byId.values()], sources: urls.length };
  }

  async function fetchIntimuraQuoteDetails(intimuraId: string, headers: Record<string, string>) {
    const url = `${intimuraQuoteUrl(intimuraId)}/__data.json?x-sveltekit-invalidated=001`;
    const r = await fetch(url, { headers });
    if (!r.ok) return { ok: false as const, status: r.status };
    const payload = (await r.json()) as any;
    const node = payload?.nodes?.find((n: any) => n?.type === "data");
    if (!node?.data) return { ok: false as const, reason: "NO_DATA_NODE" };
    const decoded = decodeSvelteData(node.data);
    return applyIntimuraDetails(intimuraId, decoded);
  }

  async function enrichIntimuraQuoteDetails(
    intimuraIds: string[],
    headers: Record<string, string>,
    max = 25,
  ) {
    const unique = [...new Set(intimuraIds.filter(Boolean))];
    let detailsUpdated = 0;
    const detailErrors: any[] = [];
    const limit = Math.min(unique.length, max);
    for (let i = 0; i < limit; i++) {
      const id = unique[i];
      try {
        const r = await fetchIntimuraQuoteDetails(id, headers);
        if (r.ok) detailsUpdated++;
        else detailErrors.push({ intimuraId: id, ...r });
      } catch (err: any) {
        detailErrors.push({ intimuraId: id, error: err?.message });
      }
    }
    if (unique.length > limit) {
      detailErrors.push({
        intimuraId: "_truncated",
        reason: `DETAILS_LIMIT_${limit}`,
        remaining: unique.length - limit,
      });
    }
    return { detailsUpdated, detailErrors, detailCandidates: unique.length };
  }

  /** Server-side pull from Intimura (cookie or Cloudflare Access token). New leads only. */
  async function runIntimuraServerSync(opts?: { enrichDetails?: boolean }) {
    if (intimuraSyncInProgress) {
      return {
        ok: false as const,
        error: "SYNC_IN_PROGRESS",
        message: "Une synchronisation Intimura est deja en cours.",
      };
    }
    intimuraSyncInProgress = true;
    try {
      const headers = buildIntimuraHeaders();
      if (!headers) {
        return {
          ok: false as const,
          error: "INTIMURA_CREDENTIALS_MISSING",
          message: "Configure un cookie Intimura ou un token Cloudflare Access sur Render.",
        };
      }

      const listRes = await fetchIntimuraQuotesFromApi(headers);
      if (!listRes.ok) {
        return {
          ok: false as const,
          error: listRes.error,
          message: listRes.message,
        };
      }

      const importResult = await importIntimuraQuotes(listRes.quotes, { runPostDedup: false });

      let detailsUpdated = 0;
      let detailErrors: any[] = [];
      let detailCandidates = 0;
      if (opts?.enrichDetails !== false) {
        const idsToEnrich = [
          ...new Set([
            ...(importResult.createdIntimuraIds || []),
            ...(importResult.detailIntimuraIds || []),
          ]),
        ];
        const enriched = await enrichIntimuraQuoteDetails(idsToEnrich, headers, 25);
        detailsUpdated = enriched.detailsUpdated;
        detailErrors = enriched.detailErrors;
        detailCandidates = enriched.detailCandidates;
      }

      return {
        ok: true as const,
        ...importResult,
        fetchedFromIntimura: listRes.quotes.length,
        detailsUpdated,
        detailErrors,
        detailCandidates,
        auto: true,
      };
    } finally {
      intimuraSyncInProgress = false;
    }
  }

  app.get("/api/intimura/auto-sync/status", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (!canUseIntimuraBookmarklet(actor?.role)) {
      return res.status(403).json({ error: "Acces refuse" });
    }
    const st = getIntimuraAutoSyncState();
    const intervalMin = Math.max(2, parseInt(process.env.INTIMURA_AUTO_SYNC_MINUTES || "5", 10) || 5);
    res.json({
      enabled: !!buildIntimuraHeaders(),
      intervalMinutes: intervalMin,
      lastAt: st.lastAt,
      lastOk: st.lastOk,
      lastError: st.lastError,
      lastResult: st.lastResult,
    });
  });

  app.post("/api/intimura/sync", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (!canUseIntimuraBookmarklet(actor?.role)) {
      return res.status(403).json({ error: "Acces refuse" });
    }
    const result = await runIntimuraServerSync({ enrichDetails: true });
    if (!result.ok) {
      return res.status(result.error === "INTIMURA_CREDENTIALS_MISSING" ? 400 : 502).json(result);
    }
    res.json(result);
  });

  // Page HTML : glisser le favori (token inclus, pas de copier-coller manuel)
  app.get("/sync-intimura-install", (req, res) => {
    if (!req.isAuthenticated()) {
      const next = encodeURIComponent("/sync-intimura-install");
      return res.redirect(`/#/login?next=${next}`);
    }
    const actor = req.user as any;
    if (!canUseIntimuraBookmarklet(actor?.role)) {
      return res.status(403).type("html").send("<p>Acces reserve aux administrateurs et directeurs des ventes.</p>");
    }
    const token = ensureBookmarkletToken();
    const apiBase = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const href = buildBookmarkletLoaderHref(apiBase, token);
    const safeHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    res.type("html").send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Installer Sync Intimura</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 20px;color:#111}
    h1{font-size:1.35rem}
    .btn{display:inline-block;margin:20px 0;padding:16px 28px;background:#059669;color:#fff;font-weight:700;font-size:1.1rem;border-radius:10px;text-decoration:none;cursor:grab;box-shadow:0 4px 14px rgba(5,150,105,.4)}
    .btn:active{cursor:grabbing}
  </style>
</head>
<body>
  <h1>Sync Intimura → ClôturePro</h1>
  <p><strong>Glisse</strong> le bouton vert ci-dessous dans ta barre de favoris (barre du haut du navigateur).</p>
  <a class="btn" href="${safeHref}" draggable="true">⇩ Sync Intimura → ClôturePro</a>
  <p>Puis sur <a href="https://crm.intimura.com/app/quotes">crm.intimura.com/app/quotes</a>, clique ce favori une fois.</p>
  <p style="font-size:.85rem;color:#666">Une boite verte en haut a droite confirme que ca fonctionne.</p>
</body>
</html>`);
  });

  // -------- Intimura bookmarklet runner (short loader → this script) --------
  app.get("/api/intimura/bookmarklet.js", (req, res) => {
    const provided = String(req.query.token || "");
    const expected = ensureBookmarkletToken();
    if (!provided || provided !== expected) {
      res
        .status(401)
        .type("application/javascript")
        .send("alert('Token invalide. Reinstalle le favori depuis CloturePro (#/intimura-bookmarklet).');");
      return;
    }
    const apiBase = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    res.type("application/javascript").send(buildIntimuraBookmarkletRunner(apiBase, provided));
  });

  // -------- Intimura ingest (called by browser bookmarklet on intimura.com) --------
  // The bookmarklet runs in the user's browser while logged in to crm.intimura.com,
  // fetches the board data using the user's authenticated session, and POSTs it here.
  // We accept CORS from intimura.com and require a per-installation bookmarklet token.
  const ingestCors = (req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && /^https?:\/\/(crm\.)?intimura\.com$/i.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Bookmarklet-Token");
    res.setHeader("Access-Control-Max-Age", "86400");
  };
  app.options("/api/intimura/ingest", (req, res) => { ingestCors(req, res); res.status(204).end(); });
  app.post("/api/intimura/ingest", async (req, res) => {
    ingestCors(req, res);
    try {
      const sessionAuthed = typeof req.isAuthenticated === "function" && req.isAuthenticated();
      if (!sessionAuthed) {
        const provided = String(req.query.token || req.headers["x-bookmarklet-token"] || req.body?.token || "");
        const expected = ensureBookmarkletToken();
        if (!provided || provided !== expected) {
          return res.status(401).json({ error: "INVALID_TOKEN", message: "Bookmarklet token invalide ou manquant." });
        }
      }
      const intimuraQuotes = extractIntimuraQuotes(req.body?.payload ?? req.body);
      if (!intimuraQuotes.length) {
        return res.status(400).json({ error: "EMPTY_PAYLOAD", message: "Aucun lead trouve dans les donnees recues." });
      }
      const result = await importIntimuraQuotes(intimuraQuotes, { runPostDedup: false });
      res.json(result);
    } catch (err: any) {
      console.error("[intimura/ingest] error", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err?.message || "Erreur serveur" });
    }
  });

  // -------- Admin: manual dedup pass over all leads --------
  // Safe to call any time; idempotent. Returns how many duplicates were merged.
  app.post("/api/admin/dedup-leads", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (actor?.role !== "admin") return res.status(403).json({ error: "Acces admin requis" });
    try {
      const result = await dedupAllLeads();
      res.json(result);
    } catch (err: any) {
      console.error("[admin/dedup-leads] error", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err?.message || "Erreur serveur" });
    }
  });

  // -------- Admin: manual dedup pass over all quotes (one per leadId) --------
  app.post("/api/admin/dedup-quotes", requireAuth, async (req, res) => {
    const actor = req.user as any;
    if (actor?.role !== "admin") return res.status(403).json({ error: "Acces admin requis" });
    try {
      const result = await dedupAllQuotes();
      res.json(result);
    } catch (err: any) {
      console.error("[admin/dedup-quotes] error", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err?.message || "Erreur serveur" });
    }
  });

  // -------- Intimura quote DETAILS (per-submission) --------
  function intimuraFormatAddress(c: any, preferService = true): string | null {
    if (!c || typeof c !== "object") return null;
    const service =
      c.service_address || c.serviceAddress || c.installation_address || c.job_site_address;
    const billing = c.billing_address || c.billingAddress;
    const pick = preferService ? service || billing || c.address : billing || c.address || service;
    if (pick && String(pick).trim()) return String(pick).trim();
    const parts = [c.street, c.address_line1, c.address_line_1, c.city, c.state, c.postal_code]
      .map((x) => (x != null && String(x).trim() ? String(x).trim() : ""))
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }

  function intimuraFenceTypeFromMeta(metadata: any[]): string | null {
    for (const m of metadata || []) {
      const label = String(m?.label || "").toLowerCase();
      if (/clôture|cloture|fence|produit|material|matériau|type/i.test(label)) {
        const v = m?.value;
        if (v != null && String(v).trim()) return String(v).trim();
      }
    }
    return null;
  }

  function intimuraLengthFromItems(items: any[]): number | null {
    let total = 0;
    for (const it of items || []) {
      const desc = String(it?.description || it?.name || "").toLowerCase();
      const unit = String(it?.unit || it?.unit_name || "").toLowerCase();
      const qty = Number(it?.qty || it?.quantity || 0);
      if (!qty) continue;
      if (/pi(?:ce|ces)?|ft|pied|linear|linéaire|longueur|lf\b/.test(desc + " " + unit)) {
        total += qty;
      }
    }
    return total > 0 ? total : null;
  }

  // Picks the subset of a decoded Svelte payload we care about for display/edit.
  function pickIntimuraDetails(decoded: any, intimuraIdHint?: string): any {
    if (!decoded || typeof decoded !== "object") return null;
    const sanitize = (v: any, depth = 0): any => {
      if (depth > 12) return null;
      if (v == null) return v;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (Array.isArray(v)) return v.map((x) => sanitize(x, depth + 1));
      if (typeof v === "object") {
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
          // Skip self-referential quote pointers that show up in some sort_order fields
          if (val && typeof val === "object" && (val as any).id && (val as any).title === decoded?.quote?.title) continue;
          out[k] = sanitize(val, depth + 1);
        }
        return out;
      }
      return null;
    };
    const customer = (() => {
      if (decoded.customer && typeof decoded.customer === "object") return sanitize(decoded.customer);
      const cid = decoded.quote?.customer_id;
      if (cid && Array.isArray(decoded.customers)) {
        const found = decoded.customers.find((c: any) => c?.id === cid);
        if (found) return sanitize(found);
      }
      return null;
    })();
    if (customer && typeof customer === "object") {
      const serviceAddr = intimuraFormatAddress(customer, true);
      const billingAddr = intimuraFormatAddress(customer, false);
      if (serviceAddr) customer.service_address_resolved = serviceAddr;
      if (billingAddr) customer.billing_address_resolved = billingAddr;
    }
    const quoteObj =
      decoded.quote && typeof decoded.quote === "object"
        ? sanitize(decoded.quote)
        : decoded.id && (decoded.title || decoded.status)
          ? sanitize(decoded)
          : null;
    const resolvedId = String(intimuraIdHint || quoteObj?.id || decoded.id || "").trim() || null;
    return {
      intimuraId: resolvedId,
      intimuraUrl: resolvedId ? intimuraQuoteUrl(resolvedId) : null,
      quote: quoteObj,
      customer,
      items: Array.isArray(decoded.items) ? decoded.items.map((i: any) => sanitize(i)) : [],
      lots: Array.isArray(decoded.lots) ? decoded.lots.map((i: any) => sanitize(i)) : [],
      taxes: Array.isArray(decoded.taxes) ? decoded.taxes.map((i: any) => sanitize(i)) : [],
      metadata: Array.isArray(decoded.metadata) ? decoded.metadata.map((i: any) => sanitize(i)) : [],
      payments: Array.isArray(decoded.payments) ? decoded.payments.map((i: any) => sanitize(i)) : [],
      documents: Array.isArray(decoded.documents) ? decoded.documents.map((i: any) => sanitize(i)) : [],
      photos: Array.isArray(decoded.photos) ? decoded.photos.map((i: any) => sanitize(i)) : [],
      timeline: Array.isArray(decoded.timeline) ? decoded.timeline.map((i: any) => sanitize(i)) : [],
      labels: Array.isArray(decoded.labels)
        ? decoded.labels.map((i: any) => sanitize(i))
        : Array.isArray(decoded.tags)
          ? decoded.tags.map((i: any) => sanitize(i))
          : [],
      firstPaymentId: decoded.firstPaymentId || null,
      firstPaymentPaid: decoded.firstPaymentPaid || false,
      fetchedAt: new Date().toISOString(),
    };
  }

  async function applyIntimuraDetails(intimuraId: string, decoded: any) {
    const details = pickIntimuraDetails(decoded, intimuraId);
    if (!details || !intimuraId) return { ok: false, reason: "EMPTY" };
    let quote = await storage.getQuoteByIntimuraId(intimuraId);
    if (!quote && intimuraId.length >= 8) {
      const prefix = intimuraId.split("-")[0];
      quote = await storage.getQuoteByIntimuraId(prefix);
      if (quote) {
        await storage.updateQuote(quote.id, { intimuraId } as any);
        if (quote.leadId) {
          const lead = await storage.getLead(quote.leadId);
          if (lead && lead.intimuraId === prefix) {
            await storage.updateLead(lead.id, { intimuraId } as any);
          }
        }
      }
    }
    if (!quote) {
      const q = details.quote || {};
      const c = details.customer || {};
      const title = q.title || q.name || "";
      const clientName = c.name || c.full_name || q.customer_name || title || "Client Intimura";
      const city = c.city || extractCity(title) || "";
      const province = c.state || c.province || inferProvince(city);
      const salesStatus = mapIntimuraStatus(String(q.status || ""));
      const lead = await storage.createLead({
        clientName: String(clientName),
        phone: c.phone || c.mobile || null,
        email: c.email || null,
        address: intimuraFormatAddress(c, true),
        city,
        province,
        postalCode: c.postal_code || null,
        neighborhood: city,
        fenceType: intimuraFenceTypeFromMeta(details.metadata) || "À confirmer",
        message: `Import fiche Intimura ${intimuraId}.`,
        source: "intimura",
        intimuraId,
        status: salesStatus === "signee" ? "gagne" : "en_cours",
        assignedSalesId: null,
        estimatedValue: Number(q.total ?? q.subtotal ?? 0) || null,
        estimatedLength: intimuraLengthFromItems(details.items || []),
      });
      quote = await createQuoteFromIntimuraRow(lead, {
        id: intimuraId,
        title,
        status: q.status,
        subtotal: q.subtotal ?? q.total,
        target_date: q.target_date,
        created_at: q.created_at,
        with_installation: q.with_installation,
        first_payment_paid_at: q.first_payment_paid_at,
      });
    }
    // Ne pas réécrire les soumissions déjà synchronisées (sync = nouveaux leads seulement).
    if (quote.intimuraData) return { ok: false, reason: "ALREADY_SYNCED" };

    const c = details.customer || {};
    const q = details.quote || {};
    const meta = details.metadata || [];
    const items = details.items || [];
    const subtotal = items.reduce(
      (sum: number, it: any) => sum + Number(it?.qty || it?.quantity || 0) * Number(it?.unit_price || it?.price || 0),
      0,
    );
    const serviceAddr = c.service_address_resolved || intimuraFormatAddress(c, true);
    const city = c.city || extractCity(q.title || "") || quote.city;
    const province = c.state || c.province || quote.province || inferProvince(city || "");
    const clientName = c.name || c.full_name || q.customer_name;
    const totalPrice = Number(q.total ?? q.subtotal ?? q.amount ?? 0) || subtotal;
    const estLength = intimuraLengthFromItems(items);
    const fenceType = intimuraFenceTypeFromMeta(meta);

    const updates: any = { intimuraData: JSON.stringify(details) };
    if (serviceAddr) updates.address = serviceAddr;
    if (city) updates.city = city;
    if (province) updates.province = province;
    if (clientName) updates.clientName = String(clientName);
    if (totalPrice > 0) updates.estimatedPrice = totalPrice;
    if (estLength) updates.estimatedLength = estLength;
    if (fenceType) updates.fenceType = fenceType;

    if (q.status) {
      const salesStatus = mapIntimuraStatus(String(q.status));
      updates.salesStatus = salesStatus;
      if (salesStatus === "signee") updates.status = "signee";
    }
    if (q.target_date || q.scheduled_date) updates.scheduledDate = q.target_date || q.scheduled_date;
    if (q.status === "approved" && q.issued_at) updates.signedDate = q.issued_at;

    const wantsInstall = q.with_installation === true || q.with_installation === 1 || q.withInstallation;
    if (wantsInstall) {
      const installNote = "Installation demandée dans Intimura.";
      updates.installNotes = quote.installNotes?.includes(installNote)
        ? quote.installNotes
        : quote.installNotes
          ? `${quote.installNotes}\n${installNote}`
          : installNote;
    }

    if (q.internal_notes) {
      const block = String(q.internal_notes).trim();
      if (block && !String(quote.salesNotes || "").includes(block)) {
        updates.salesNotes = quote.salesNotes
          ? `${quote.salesNotes}\n\n--- Intimura ---\n${block}`
          : block;
      }
    }

    if (details.firstPaymentPaid || q.first_payment_paid_at) {
      updates.paidDate = q.first_payment_paid_at || quote.paidDate;
    }

    await storage.updateQuote(quote.id, updates);

    if (quote.leadId) {
      const lead = await storage.getLead(quote.leadId);
      if (lead) {
        const leadUpd: any = {};
        if (c.phone || c.mobile) leadUpd.phone = c.phone || c.mobile;
        if (c.email) leadUpd.email = c.email;
        if (serviceAddr) leadUpd.address = serviceAddr;
        if (c.postal_code) leadUpd.postalCode = c.postal_code;
        if (city) leadUpd.city = city;
        if (province) leadUpd.province = province;
        if (clientName) leadUpd.clientName = String(clientName);
        if (fenceType) leadUpd.fenceType = fenceType;
        if (totalPrice > 0) leadUpd.estimatedValue = totalPrice;
        if (Object.keys(leadUpd).length) await storage.updateLead(lead.id, leadUpd);
      }
    }
    return { ok: true, quoteId: quote.id };
  }

  app.options("/api/intimura/ingest-details", (req, res) => { ingestCors(req, res); res.status(204).end(); });
  app.post("/api/intimura/ingest-details", async (req, res) => {
    ingestCors(req, res);
    try {
      const sessionAuthed = typeof req.isAuthenticated === "function" && req.isAuthenticated();
      if (!sessionAuthed) {
        const provided = String(req.query.token || req.headers["x-bookmarklet-token"] || req.body?.token || "");
        const expected = ensureBookmarkletToken();
        if (!provided || provided !== expected) {
          return res.status(401).json({ error: "INVALID_TOKEN" });
        }
      }
      // Accepts { items: [{ intimuraId, decoded | svelteData }] } OR { intimuraId, decoded | svelteData }
      const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
      const results: any[] = [];
      for (const item of items) {
        const intimuraId = String(item?.intimuraId || "");
        let decoded = item?.decoded;
        if (!decoded && Array.isArray(item?.svelteData)) {
          decoded = decodeSvelteData(item.svelteData);
        }
        const r = await applyIntimuraDetails(intimuraId, decoded);
        results.push({ intimuraId: item?.intimuraId, ...r });
      }
      const updated = results.filter(r => r.ok).length;
      res.json({ received: items.length, updated, results });
    } catch (err: any) {
      console.error("[intimura/ingest-details] error", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err?.message });
    }
  });

  // Server-side fetch of details for every quote that has an intimura_id but no
  // stored details. Requires Intimura credentials on the server.
  app.post("/api/intimura/sync-details", async (_req, res) => {
    const headers = buildIntimuraHeaders();
    if (!headers) {
      return res.status(400).json({ error: "INTIMURA_CREDENTIALS_MISSING" });
    }
    const all = await storage.getQuotes();
    const targets = all.filter((q: any) => q.intimuraId && !q.intimuraData);
    let updated = 0;
    const errors: any[] = [];
    for (const q of targets) {
      try {
        const url = `${intimuraQuoteUrl(q.intimuraId)}/__data.json?x-sveltekit-invalidated=001`;
        const r = await fetch(url, { headers });
        if (!r.ok) { errors.push({ id: q.intimuraId, status: r.status }); continue; }
        const payload = await r.json() as any;
        const node = payload?.nodes?.find((n: any) => n?.type === "data");
        if (!node?.data) { errors.push({ id: q.intimuraId, reason: "NO_DATA_NODE" }); continue; }
        const decoded = decodeSvelteData(node.data);
        const result = await applyIntimuraDetails(q.intimuraId, decoded);
        if (result.ok) updated++;
        else errors.push({ id: q.intimuraId, reason: result.reason });
      } catch (err: any) {
        errors.push({ id: q.intimuraId, error: err?.message });
      }
    }
    res.json({ candidates: targets.length, updated, errors });
  });

  // Auto-sync Intimura toutes les N minutes (Render/production) quand cookie ou CF token est configure.
  const g = globalThis as any;
  if (!g.__intimuraPollerStarted) {
    g.__intimuraPollerStarted = true;
    const intervalMs =
      Math.max(2, parseInt(process.env.INTIMURA_AUTO_SYNC_MINUTES || "5", 10) || 5) * 60 * 1000;
    const tick = async () => {
      if (!buildIntimuraHeaders()) return;
      const st = getIntimuraAutoSyncState();
      try {
        const result = await runIntimuraServerSync({ enrichDetails: true });
        st.lastAt = new Date().toISOString();
        if (result.ok) {
          st.lastOk = true;
          st.lastError = null;
          st.lastResult = result;
          if ((result.createdLeads || 0) > 0) {
            console.log(
              `[intimura auto-sync] ${result.createdLeads} nouveau(x) lead(s), ${result.detailsUpdated || 0} fiche(s) detaillee(s)`,
            );
          }
        } else {
          st.lastOk = false;
          st.lastError = result.message || result.error;
          st.lastResult = null;
          console.warn("[intimura auto-sync]", st.lastError);
        }
      } catch (error: any) {
        st.lastAt = new Date().toISOString();
        st.lastOk = false;
        st.lastError = error?.message || String(error);
        st.lastResult = null;
        console.warn("[intimura auto-sync] error", error);
      }
    };
    setTimeout(() => tick(), 15_000);
    setInterval(tick, intervalMs);
    console.log(`[intimura auto-sync] polling every ${intervalMs / 60000} min when credentials are set`);
  }

  // -------- Quotes --------
  app.get("/api/quotes", async (req, res) => {
    const cached = getCachedApiResponse<any[]>(req);
    if (cached) {
      return res.json(cached);
    }
    const actor = req.user as any;
    let quotes = await storage.getQuotes();
    // Sales reps can see quotes assigned to them directly, or linked to their assigned leads.
    if (actor?.role === "sales_rep") {
      const assignedLeadIds = new Set(
        (await storage.getLeads())
          .filter((l: any) => l.assignedSalesId === actor.id)
          .map((l: any) => l.id),
      );
      quotes = quotes.filter((q: any) => q.assignedSalesId === actor.id || (q.leadId && assignedLeadIds.has(q.leadId)));
    }
    setCachedApiResponse(req, quotes);
    res.json(quotes);
  });
  app.get("/api/quotes/:id", async (req, res) => {
    const q = await storage.getQuote(Number(req.params.id));
    if (!q) return res.status(404).json({ error: "Not found" });
    const actor = req.user as any;
    if (actor?.role === "sales_rep" && q.assignedSalesId !== actor.id) {
      const linkedLead = q.leadId ? await storage.getLead(q.leadId) : null;
      if (!linkedLead || linkedLead.assignedSalesId !== actor.id) {
        return res.status(403).json({ error: "Acces refuse" });
      }
    }
    res.json(q);
  });
  app.post("/api/quotes", async (req, res) => {
    const { _userId, _userName, _userRole, ...payload } = req.body;
    const parsed = insertQuoteSchema.safeParse(payload);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const quote = await storage.createQuote(parsed.data);
    await storage.createActivity({
      quoteId: quote.id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: "create",
      note: "Soumission créée",
    });
    res.json(quote);
  });
  app.patch("/api/quotes/:id", async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getQuote(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { _userId, _userName, _userRole, _timelineStep, _note, ...payload } = req.body;

    if (_timelineStep) {
      const timeline = existing.timeline ? JSON.parse(existing.timeline) : [];
      timeline.push({ step: _timelineStep, date: new Date().toISOString(), userName: _userName, note: _note });
      payload.timeline = JSON.stringify(timeline);
    }

    const updated = await storage.updateQuote(id, payload);

    let assignedInstallerName: string | null = null;
    if (payload.assignedInstallerId && Number(payload.assignedInstallerId) !== (existing.assignedInstallerId || null)) {
      const installer = await storage.getUser(Number(payload.assignedInstallerId));
      assignedInstallerName = installer?.name || null;
      if (installer?.email) {
        const emailResult = await sendInstallerAssignedEmail({
          to: installer.email,
          installerName: installer.name,
          clientName: updated.clientName,
          city: updated.city,
          province: updated.province,
          fenceType: updated.fenceType,
        });
        if (!emailResult.ok) {
          console.warn("[installer-assignment-email] failed:", emailResult.error || "unknown error");
        }
      }
    }

    await storage.createActivity({
      quoteId: id,
      userId: _userId || null,
      userName: _userName || "Système",
      userRole: _userRole || "system",
      action: _timelineStep ? "status_change" : "update",
      note: assignedInstallerName
        ? `Assignation installateur → ${assignedInstallerName} (notification envoyée)`
        : _note || (payload.salesStatus ? `Vente → ${payload.salesStatus}` : payload.installStatus ? `Install → ${payload.installStatus}` : "Mise à jour"),
    });
    res.json(updated);
  });
  app.delete("/api/quotes/:id", async (req, res) => {
    const deleted = await storage.deleteQuote(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted });
  });

  // -------- Crews --------
  app.get("/api/crews", async (_req, res) => {
    res.json(await storage.getCrews());
  });
  app.post("/api/crews", async (req, res) => {
    const parsed = insertCrewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const crew = await storage.createCrew(parsed.data);
    res.json(crew);
  });
  app.patch("/api/crews/:id", async (req, res) => {
    const parsed = insertCrewSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await storage.updateCrew(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });
  app.delete("/api/crews/:id", async (req, res) => {
    const deleted = await storage.deleteCrew(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted });
  });

  // -------- Activities --------
  app.get("/api/activities", async (req, res) => {
    const filter: any = {};
    if (req.query.quoteId) filter.quoteId = Number(req.query.quoteId);
    if (req.query.leadId) filter.leadId = Number(req.query.leadId);
    res.json(await storage.getActivities(filter));
  });
  app.post("/api/activities", async (req, res) => {
    const parsed = insertActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await storage.createActivity(parsed.data));
  });

  // -------- Dormant alerts --------
  // Lead non contacté depuis 48h (rule 1) ou soumission envoyée sans réponse depuis 5 jours (rule 2)
  app.get("/api/alerts/dormant", async (req, res) => {
    const actor = req.user as any;
    const [allLeads, allQuotes, allActivities, allUsers] = await Promise.all([
      storage.getLeads(),
      storage.getQuotes(),
      storage.getActivities(),
      storage.getUsers(),
    ]);

    const userById = new Map<number, any>(allUsers.map((u: any) => [u.id, u]));

    // Activities arrive ordered by desc(id) → first occurrence per lead/quote = newest.
    const lastActByLead = new Map<number, string>();
    const lastActByQuote = new Map<number, string>();
    for (const a of allActivities) {
      if (a.leadId && !lastActByLead.has(a.leadId)) lastActByLead.set(a.leadId, a.createdAt);
      if (a.quoteId && !lastActByQuote.has(a.quoteId)) lastActByQuote.set(a.quoteId, a.createdAt);
    }

    const now = Date.now();
    const HOUR = 3_600_000;
    const DAY = 86_400_000;
    const LEAD_HOURS = 48;
    const QUOTE_DAYS = 5;

    const parseTs = (s: string | null | undefined): number | null => {
      if (!s || s === "CURRENT_TIMESTAMP") return null;
      const t = Date.parse(s);
      return isNaN(t) ? null : t;
    };
    const repName = (id: number | null | undefined) => (id ? userById.get(id)?.name || null : null);

    // Rule 1: leads still open + déjà assignés mais aucun contact en 48h
    const openLeadStatuses = new Set(["nouveau", "a_qualifier", "assigne", "en_cours", "contacte"]);
    const dormantLeads: any[] = [];
    for (const l of allLeads) {
      if (!openLeadStatuses.has(l.status)) continue;
      if (!l.assignedSalesId) continue; // déjà visible côté Dispatch vendeur
      if (actor?.role === "sales_rep" && l.assignedSalesId !== actor.id) continue;
      const last = parseTs(lastActByLead.get(l.id)) ?? parseTs(l.createdAt);
      const reference = last ?? now;
      const hoursSince = (now - reference) / HOUR;
      if (hoursSince >= LEAD_HOURS) {
        dormantLeads.push({
          id: l.id,
          clientName: l.clientName,
          city: l.city,
          province: l.province,
          phone: l.phone,
          email: l.email,
          status: l.status,
          assignedSalesId: l.assignedSalesId,
          assignedSalesName: repName(l.assignedSalesId),
          lastActivityAt: last ? new Date(last).toISOString() : null,
          createdAt: l.createdAt,
          hoursSince: Math.round(hoursSince),
        });
      }
    }
    dormantLeads.sort((a, b) => b.hoursSince - a.hoursSince);

    // Rule 2: soumissions envoyées sans signature depuis 5 jours
    const dormantQuotes: any[] = [];
    for (const q of allQuotes) {
      const isSent = q.salesStatus === "envoyee" || q.status === "envoyee";
      if (!isSent) continue;
      if (q.signedDate) continue;
      if (actor?.role === "sales_rep" && q.assignedSalesId !== actor.id) continue;

      // sentAt: prefer timeline entry tagged "envoy*", else last activity, else createdAt
      let sentAt: number | null = null;
      if (q.timeline) {
        try {
          const arr = JSON.parse(q.timeline);
          if (Array.isArray(arr)) {
            const sentEntry = arr.find((e: any) => {
              const step = typeof e?.step === "string" ? e.step : "";
              const note = typeof e?.note === "string" ? e.note : "";
              return /envoy|sent/i.test(step) || /envoy|sent/i.test(note);
            });
            if (sentEntry?.date) sentAt = parseTs(sentEntry.date);
          }
        } catch {}
      }
      if (!sentAt) sentAt = parseTs(lastActByQuote.get(q.id)) ?? parseTs(q.createdAt);
      if (!sentAt) continue;
      const daysSince = (now - sentAt) / DAY;
      if (daysSince >= QUOTE_DAYS) {
        dormantQuotes.push({
          id: q.id,
          leadId: q.leadId,
          clientName: q.clientName,
          city: q.city,
          province: q.province,
          salesStatus: q.salesStatus,
          assignedSalesId: q.assignedSalesId,
          assignedSalesName: repName(q.assignedSalesId),
          sentAt: new Date(sentAt).toISOString(),
          daysSince: Math.round(daysSince),
          estimatedPrice: q.estimatedPrice,
        });
      }
    }
    dormantQuotes.sort((a, b) => b.daysSince - a.daysSince);

    res.json({
      thresholds: { leadHours: LEAD_HOURS, quoteDays: QUOTE_DAYS },
      leads: dormantLeads,
      quotes: dormantQuotes,
      totals: {
        leads: dormantLeads.length,
        quotes: dormantQuotes.length,
        total: dormantLeads.length + dormantQuotes.length,
      },
      generatedAt: new Date().toISOString(),
    });
  });

  // -------- Aggregated stats --------
  app.get("/api/stats", async (req, res) => {
    const cached = getCachedApiResponse<any>(req);
    if (cached) {
      return res.json(cached);
    }
    const [allLeads, allQuotes, allUsers, allCrews] = await Promise.all([
      storage.getLeads(), storage.getQuotes(), storage.getUsers(), storage.getCrews(),
    ]);
    const activeLeads = allLeads.filter(l => l.status !== "test");
    const nouveau = activeLeads.filter(l => l.status === "nouveau").length;
    const enCours = allQuotes.filter(q => ["envoyee", "suivi", "rendez_vous", "rdv_mesure", "nouveau", "contacte"].includes(q.salesStatus)).length;
    const gagne = allQuotes.filter(q => q.salesStatus === "signee").length;
    const installPlanned = allQuotes.filter(q => q.installStatus === "planifiee").length;
    const enRetard = allQuotes.filter(q => {
      if (!q.scheduledDate) return false;
      return new Date(q.scheduledDate) < new Date(Date.now() - 86400000) && q.installStatus !== "terminee";
    }).length;
    const estimatedValue = allQuotes
      .filter(q => !["perdue"].includes(q.salesStatus))
      .reduce((s, q) => s + (q.estimatedPrice || 0), 0);

    const stats = {
      leadsCount: activeLeads.length,
      newLeads: nouveau,
      quotesInProgress: enCours,
      quotesWon: gagne,
      installsPlanned: installPlanned,
      installsLate: enRetard,
      estimatedValue,
      crewsCount: allCrews.length,
      usersCount: allUsers.length,
    };
    setCachedApiResponse(req, stats);
    res.json(stats);
  });

  // -------- Script d'appel IA --------
  app.post("/api/quotes/:id/call-script", requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "ID invalide" });

      const [quote, allLeads, allActivities, allUsers] = await Promise.all([
        storage.getQuote(id),
        storage.getLeads(),
        storage.getActivities({ quoteId: id }),
        storage.getUsers(),
      ]);

      if (!quote) return res.status(404).json({ error: "Soumission introuvable" });

      const lead = allLeads.find((l: any) => l.id === quote.leadId) || null;
      const rep = allUsers.find((u: any) => u.id === quote.assignedSalesId) || null;

      let intimuraItems: any[] = [];
      let intimuraMeta: any[] = [];
      try {
        if (quote.intimuraData) {
          const d = JSON.parse(quote.intimuraData as any);
          intimuraItems = Array.isArray(d?.items) ? d.items : [];
          intimuraMeta = Array.isArray(d?.metadata) ? d.metadata : [];
        }
      } catch {}

      const recentActivities = (allActivities as any[]).slice(0, 5)
        .map((a: any) => `- ${a.createdAt?.slice(0, 10) || "?"} | ${a.userName || "?"} : ${a.note || a.action}`)
        .join("\n");

      const itemsDesc = intimuraItems
        .map((it: any) => `• ${it.description || "Article"} × ${it.qty} @ ${it.unit_price}$`)
        .join("\n") || "Aucun article détaillé";

      const metaDesc = intimuraMeta
        .map((m: any) => `${m.label}: ${m.value}`)
        .join(", ") || "Aucune spécification";

      const stageLabel: Record<string, string> = {
        nouveau: "premier contact",
        contacte: "suivi après premier contact",
        rdv_mesure: "confirmation du rendez-vous mesure",
        envoyee: "suivi de soumission envoyée",
        suivi: "relance après suivi",
        rendez_vous: "préparation du rendez-vous de signature",
        signee: "confirmation post-signature",
        perdue: "tentative de récupération",
      };

      const prompt = `Tu es un coach de vente senior spécialisé dans les clôtures résidentielles et commerciales au Canada.

Génère un script d'appel personnalisé en français pour ce vendeur de Cloture Impress.

## Contexte du prospect
- Nom : ${(quote as any).clientName}
- Ville : ${(quote as any).city || "?"}, ${(quote as any).province || "?"}
- Type de clôture : ${(quote as any).fenceType || "Non précisé"}
- Longueur estimée : ${(quote as any).estimatedLength ? (quote as any).estimatedLength + " pi" : "Non précisée"}
- Prix estimé : ${(quote as any).estimatedPrice ? (quote as any).estimatedPrice + " $" : "Non précisé"}
- Source du lead : ${(lead as any)?.source || "Non précisée"}
- Message initial : ${(lead as any)?.message || "Aucun"}
- Spécifications Intimura : ${metaDesc}
- Articles soumis : ${itemsDesc}
- Étape vente : ${(quote as any).salesStatus} (${stageLabel[(quote as any).salesStatus] || "suivi"})
- Notes vente : ${(quote as any).salesNotes || "Aucune"}
- Historique récent : ${recentActivities || "Aucune activité"}
- Vendeur assigné : ${(rep as any)?.name || "Non assigné"} (${(rep as any)?.region || "?"})

Produis un script structuré avec exactement ces 5 sections :

**🎯 OBJECTIF DE L'APPEL**
[1-2 phrases sur le but précis selon l'étape actuelle]

**👋 OUVERTURE (30 secondes)**
[Script mot-à-mot pour démarrer l'appel]

**❓ QUESTIONS CLÉS**
[3-5 questions ciblées basées sur ce qu'on ne sait pas encore]

**🚧 OBJECTIONS PROBABLES**
[2-3 objections courantes et comment y répondre]

**✅ PROCHAINE ÉTAPE**
[Exactement quoi demander pour faire avancer le dossier]

Sois concret, direct, adapté au marché québécois.`;

      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        return res.json({
          script: `**🎯 OBJECTIF DE L'APPEL**\n${stageLabel[(quote as any).salesStatus] || "suivi"} avec ${(quote as any).clientName}.\n\n**👋 OUVERTURE (30 secondes)**\n"Bonjour ${(quote as any).clientName}, c'est [votre prénom] de Cloture Impress. Je vous appelle concernant votre projet de ${(quote as any).fenceType || "clôture"} à ${(quote as any).city || "votre domicile"}. Avez-vous quelques minutes ?"\n\n**❓ QUESTIONS CLÉS**\n• Avez-vous eu le temps de regarder notre soumission ?\n• Le budget correspond-il à ce que vous aviez en tête ?\n• Y a-t-il des détails à ajuster sur le projet ?\n• Quelle est votre date idéale pour les travaux ?\n• Avez-vous d'autres soumissions en cours ?\n\n**🚧 OBJECTIONS PROBABLES**\n• "C'est trop cher" → Valorisez la qualité, proposez un ajustement de portée\n• "Je dois y penser" → Demandez ce qui bloque, proposez un RDV en personne\n• "J'attends une autre soumission" → Mettez en avant votre garantie et délais\n\n**✅ PROCHAINE ÉTAPE**\n"Est-ce qu'on peut confirmer un rendez-vous cette semaine pour finaliser les détails ?"\n\n---\n*⚠️ Script template — ajoutez ANTHROPIC_API_KEY dans Render pour des scripts personnalisés par IA.*`,
          source: "template",
        });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(502).json({ error: "Erreur API Anthropic", detail: err });
      }

      const data = await response.json() as any;
      const script = data?.content?.[0]?.text || "Impossible de générer le script.";
      res.json({ script, source: "ai" });
    } catch (err) {
      next(err);
    }
  });



  // ============= PHOTOS DE FIN DE CHANTIER =============
  app.post("/api/quotes/:id/completion-photos", requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { photos } = req.body as { photos: Array<{ url: string; uploadedBy: string }> };
      if (!Array.isArray(photos) || photos.length === 0) {
        return res.status(400).json({ error: "photos array requis" });
      }
      if (photos.length > 3) {
        return res.status(400).json({ error: "Maximum 3 photos" });
      }
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ error: "Soumission introuvable" });

      const existing: any[] = quote.completionPhotos ? JSON.parse(quote.completionPhotos as string) : [];
      const now = new Date().toISOString();
      const merged = [
        ...existing,
        ...photos.map((p) => ({ url: p.url, uploadedAt: now, uploadedBy: p.uploadedBy })),
      ].slice(-3); // keep latest 3 max

      await storage.updateQuote(id, { completionPhotos: JSON.stringify(merged) } as any);

      // Log activity
      const user = req.user as any;
      await storage.createActivity({
        quoteId: id,
        leadId: (quote as any).leadId ?? null,
        userId: user.id,
        action: "Photos de fin de chantier ajoutées",
        note: `${photos.length} photo(s) ajoutée(s) par ${user.name || user.email}`,
      });

      res.json({ ok: true, photos: merged });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/quotes/:id/completion-photos/:idx", requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const idx = Number(req.params.idx);
      const quote = await storage.getQuote(id);
      if (!quote) return res.status(404).json({ error: "Soumission introuvable" });

      const existing: any[] = quote.completionPhotos ? JSON.parse(quote.completionPhotos as string) : [];
      existing.splice(idx, 1);
      await storage.updateQuote(id, { completionPhotos: JSON.stringify(existing) } as any);
      res.json({ ok: true, photos: existing });
    } catch (err) {
      next(err);
    }
  });

  // ============= ANALYTICS =============
  app.get("/api/analytics", requireAuth, async (req, res, next) => {
    try {
      const [allQuotes, allLeads] = await Promise.all([
        storage.getQuotes(),
        storage.getLeads(),
      ]);

      // 1. Taux de fermeture par type de clôture
      const fenceMap = new Map<string, { total: number; signed: number; lost: number }>();
      for (const q of allQuotes) {
        const ft = (q as any).fenceType || "Non défini";
        if (!fenceMap.has(ft)) fenceMap.set(ft, { total: 0, signed: 0, lost: 0 });
        const entry = fenceMap.get(ft)!;
        entry.total++;
        if ((q as any).salesStatus === "signee") entry.signed++;
        if ((q as any).salesStatus === "perdue") entry.lost++;
      }
      const closureByFenceType = Array.from(fenceMap.entries())
        .map(([fenceType, v]) => ({
          fenceType: fenceType
            .replace(/^Clôture d'intimité - /i, "Intimité - ")
            .replace(/^Clôture ornementale - /i, "Ornementale - ")
            .replace(/^Clôture pour /i, "Pour ")
            .replace(/^Clôture /i, "")
            .replace(/^Portail sur mesure - /i, "Portail - "),
          fenceTypeFull: fenceType,
          ...v,
          rate: v.total > 0 ? Math.round((v.signed / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.rate - a.rate);

      // 2. Coût d'acquisition par source
      const sourceMap = new Map<string, { leads: number; signed: number; revenue: number }>();
      for (const lead of allLeads) {
        const src = (lead as any).source || "inconnu";
        if (!sourceMap.has(src)) sourceMap.set(src, { leads: 0, signed: 0, revenue: 0 });
        sourceMap.get(src)!.leads++;
      }
      for (const q of allQuotes) {
        if ((q as any).leadId && (q as any).salesStatus === "signee") {
          const lead = allLeads.find((l: any) => l.id === (q as any).leadId);
          if (lead) {
            const src = (lead as any).source || "inconnu";
            if (!sourceMap.has(src)) sourceMap.set(src, { leads: 0, signed: 0, revenue: 0 });
            const entry = sourceMap.get(src)!;
            entry.signed++;
            entry.revenue += (q as any).finalPrice || (q as any).estimatedPrice || 0;
          }
        }
      }
      const acquisitionBySource = Array.from(sourceMap.entries())
        .map(([source, v]) => ({
          source,
          leadCount: v.leads,
          signedCount: v.signed,
          totalRevenue: Math.round(v.revenue),
          conversionRate: v.leads > 0 ? Math.round((v.signed / v.leads) * 100) : 0,
        }))
        .sort((a, b) => b.conversionRate - a.conversionRate);

      // 3. Durée moyenne par étape
      const subToSign: number[] = [];
      const signToInstall: number[] = [];
      for (const q of allQuotes) {
        if ((q as any).signedDate && (q as any).createdAt) {
          const created = new Date((q as any).createdAt).getTime();
          const signed = new Date((q as any).signedDate).getTime();
          const days = (signed - created) / (1000 * 60 * 60 * 24);
          if (days >= 0 && days < 730) subToSign.push(days);
        }
        if ((q as any).signedDate && (q as any).installedDate) {
          const signed = new Date((q as any).signedDate).getTime();
          const installed = new Date((q as any).installedDate).getTime();
          const days = (installed - signed) / (1000 * 60 * 60 * 24);
          if (days >= 0 && days < 730) signToInstall.push(days);
        }
      }
      const avgArr = (arr: number[]) =>
        arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
      const avgDurationByStage = [
        { stage: "Soumission → Signature", avgDays: avgArr(subToSign), sampleSize: subToSign.length },
        { stage: "Signature → Installation", avgDays: avgArr(signToInstall), sampleSize: signToInstall.length },
      ];

      res.json({ closureByFenceType, acquisitionBySource, avgDurationByStage });
    } catch (err) {
      next(err);
    }
  });


  // ============= BACKGROUND JOBS : ALERTES RETARD + SMS SATISFACTION =============

  async function checkOverdueInstalls() {
    try {
      const allQuotes = await storage.getQuotes();
      const allUsers = await storage.getUsers();
      const directors = allUsers.filter((u: any) =>
        ["admin", "install_director"].includes((u as any).role) && (u as any).email,
      );
      if (!directors.length) return;

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const terminalStatuses = ["terminee", "probleme", "inspection"];

      for (const q of allQuotes) {
        const sq = q as any;
        if (!sq.scheduledDate) continue;
        if (terminalStatuses.includes(sq.installStatus)) continue;

        const scheduled = new Date(sq.scheduledDate).getTime();
        if (isNaN(scheduled) || scheduled > now - oneDayMs) continue;

        // Don't re-alert within 20h
        if (sq.overdueAlertSentAt) {
          const sentAt = new Date(sq.overdueAlertSentAt).getTime();
          if (now - sentAt < 20 * 60 * 60 * 1000) continue;
        }

        let installerName: string | null = null;
        if (sq.assignedInstallerId) {
          const inst = allUsers.find((u: any) => u.id === sq.assignedInstallerId);
          installerName = (inst as any)?.name ?? null;
        }

        await sendOverdueInstallAlert({
          directors: directors.map((d: any) => ({ name: d.name, email: d.email })),
          quote: {
            id: sq.id,
            clientName: sq.clientName,
            city: sq.city,
            scheduledDate: sq.scheduledDate,
            installerName,
            fenceType: sq.fenceType,
          },
        });

        await storage.updateQuote(sq.id, { overdueAlertSentAt: new Date().toISOString() } as any);
        console.log(`[jobs] Overdue alert sent for quote #${sq.id} (${sq.clientName})`);
      }
    } catch (err) {
      console.error("[jobs] checkOverdueInstalls error:", err);
    }
  }

  async function checkSatisfactionSms() {
    try {
      const allQuotes = await storage.getQuotes();
      const allLeads = await storage.getLeads();
      const now = Date.now();
      const delay = 24 * 60 * 60 * 1000;

      for (const q of allQuotes) {
        const sq = q as any;
        if (sq.installStatus !== "terminee") continue;
        if (sq.satisfactionSmsSentAt) continue;
        if (!sq.installedDate) continue;

        const installedAt = new Date(sq.installedDate).getTime();
        if (isNaN(installedAt) || now - installedAt < delay) continue;

        let phone: string | null = null;
        let clientName = sq.clientName || "Client";
        if (sq.leadId) {
          const lead = allLeads.find((l: any) => l.id === sq.leadId);
          if (lead) {
            phone = (lead as any).phone ?? null;
            clientName = (lead as any).clientName || clientName;
          }
        }

        if (!phone) {
          console.log(`[jobs] No phone for quote #${sq.id} — marking skipped`);
          await storage.updateQuote(sq.id, { satisfactionSmsSentAt: `no-phone-${new Date().toISOString()}` } as any);
          continue;
        }

        const result = await sendSatisfactionSms(phone, clientName);
        const sentAt = result.ok
          ? new Date().toISOString()
          : `error-${new Date().toISOString()}`;

        await storage.updateQuote(sq.id, { satisfactionSmsSentAt: sentAt } as any);
        console.log(`[jobs] Satisfaction SMS quote #${sq.id}: ok=${result.ok}`, result.sid || result.error || "");
      }
    } catch (err) {
      console.error("[jobs] checkSatisfactionSms error:", err);
    }
  }

  // Run on startup after 15s then every hour
  setTimeout(() => { checkOverdueInstalls(); checkSatisfactionSms(); }, 15_000);
  setInterval(() => { checkOverdueInstalls(); checkSatisfactionSms(); }, 60 * 60 * 1000);

  return httpServer;
}
