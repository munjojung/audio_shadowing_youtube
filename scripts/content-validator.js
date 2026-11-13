"use strict";

const fs = require("node:fs");
const path = require("node:path");

const LIMITS = {
  audio: 300 * 1024 * 1024,
  ko: 5 * 1024 * 1024,
  en: 5 * 1024 * 1024
};

function validateContentInfo(id, title, base) {
  if (typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new Error("Invalid content ID");
  }

  if (typeof title !== "string" ||
      !title.trim() ||
      title.length > 200) {
    throw new Error("Invalid content title");
  }

  if (typeof base !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(base) ||
      !base.endsWith("_" + id)) {
    throw new Error("Invalid filename base");
  }

  return { id, title: title.trim(), base };
}

function validateFileNames(id, audio, ko, en) {
  const base = path.basename(audio, ".mp3");

  validateContentInfo(id, "Validation", base);

  if (
    path.basename(audio) !== base + ".mp3" ||
    path.basename(ko) !== base + "_ko.vtt" ||
    path.basename(en) !== base + "_en.vtt"
  ) {
    throw new Error("Filename/ID mismatch");
  }

  return base;
}

function validateFileSize(file, slot) {
  if (!Object.hasOwn(LIMITS, slot)) {
    throw new Error("Invalid file slot");
  }

  const stat = fs.statSync(file);

  if (!stat.isFile() || stat.size < 1 ||
      stat.size > LIMITS[slot]) {
    throw new Error("Invalid file size: " + slot);
  }

  return stat.size;
}

function parseTimestamp(value) {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);

  if (!match) {
    throw new Error("Invalid VTT timestamp");
  }

  return (
    Number(match[1]) * 3600000 +
    Number(match[2]) * 60000 +
    Number(match[3]) * 1000 +
    Number(match[4])
  );
}

function validateVtt(file) {
  const text = fs.readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "");

  if (!/^WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(text)) {
    throw new Error("Missing WEBVTT header");
  }

  const lines = text.split(/\r?\n/);
  let cues = 0;

  for (const line of lines) {
    if (!line.includes("-->")) continue;

    const match = line.trim().match(
      /^(\d{2,}:[0-5]\d:[0-5]\d\.\d{3})\s+-->\s+(\d{2,}:[0-5]\d:[0-5]\d\.\d{3})(?:\s+.*)?$/
    );

    if (!match) {
      throw new Error("Invalid VTT cue timing");
    }

    if (parseTimestamp(match[1]) >= parseTimestamp(match[2])) {
      throw new Error("VTT cue end must be after start");
    }

    cues++;
  }

  if (cues === 0) {
    throw new Error("VTT contains no cues");
  }

  return { cues };
}

function validateMp3(file) {
  const fd = fs.openSync(file, "r");

  try {
    const header = Buffer.alloc(10);
    const bytes = fs.readSync(fd, header, 0, 10, 0);

    if (bytes < 3) {
      throw new Error("Invalid MP3 header");
    }

    const id3 = header.subarray(0, 3).toString() === "ID3";
    const frame = header[0] === 0xff &&
                  (header[1] & 0xe0) === 0xe0;

    if (!id3 && !frame) {
      throw new Error("Invalid MP3 header");
    }

    return true;
  } finally {
    fs.closeSync(fd);
  }
}

function validateFiles(id, audio, ko, en) {
  const base = validateFileNames(id, audio, ko, en);

  const sizes = {
    audio: validateFileSize(audio, "audio"),
    ko: validateFileSize(ko, "ko"),
    en: validateFileSize(en, "en")
  };

  validateMp3(audio);

  const koResult = validateVtt(ko);
  const enResult = validateVtt(en);

  return {
    id,
    base,
    sizes,
    cues: {
      ko: koResult.cues,
      en: enResult.cues
    }
  };
}

module.exports = {
  LIMITS,
  validateContentInfo,
  validateFileNames,
  validateFileSize,
  validateVtt,
  validateMp3,
  validateFiles
};
