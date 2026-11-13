"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const v = require("../scripts/content-validator");

const ID = "tsSHK7o5FbE";
const BASE = "lesson_" + ID;

test("Valid content information", () => {
  assert.deepEqual(
    v.validateContentInfo(ID, " Test title ", BASE),
    { id: ID, title: "Test title", base: BASE }
  );
});

test("Invalid content ID is rejected", () => {
  assert.throws(
    () => v.validateContentInfo("invalid", "Title", BASE),
    /Invalid content ID/
  );
});

test("Invalid filename is rejected", () => {
  assert.throws(
    () => v.validateFileNames(
      ID, BASE + ".mp3",
      "wrong_ko.vtt",
      BASE + "_en.vtt"
    ),
    /Filename\/ID mismatch/
  );
});

test("Valid VTT is accepted", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "shadowing-test-")
  );
  try {
    const file = path.join(dir, "valid.vtt");
    fs.writeFileSync(
      file,
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n"
    );
    assert.equal(v.validateVtt(file).cues, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Invalid VTT header is rejected", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "shadowing-test-")
  );
  try {
    const file = path.join(dir, "invalid.vtt");
    fs.writeFileSync(
      file,
      "INVALID\n\n00:00:01.000 --> 00:00:02.000\nHello\n"
    );
    assert.throws(
      () => v.validateVtt(file),
      /Missing WEBVTT header/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VTT end time must follow start time", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "shadowing-test-")
  );
  try {
    const file = path.join(dir, "invalid.vtt");
    fs.writeFileSync(
      file,
      "WEBVTT\n\n00:00:03.000 --> 00:00:02.000\nHello\n"
    );
    assert.throws(
      () => v.validateVtt(file),
      /VTT cue end must be after start/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Empty file is rejected", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "shadowing-test-")
  );
  try {
    const file = path.join(dir, "empty.mp3");
    fs.writeFileSync(file, "");
    assert.throws(
      () => v.validateFileSize(file, "audio"),
      /Invalid file size/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Invalid MP3 header is rejected", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "shadowing-test-")
  );
  try {
    const file = path.join(dir, "invalid.mp3");
    fs.writeFileSync(file, "NOT AN MP3 FILE");
    assert.throws(
      () => v.validateMp3(file),
      /Invalid MP3 header/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
