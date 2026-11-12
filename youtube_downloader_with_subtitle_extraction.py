# ================================================================
# YouTube → MP4 다운로드 + 자막(VTT/SRT) 자동 추출
# + Google Drive (youtubeckies/cookies.txt) 마운트 에러 자동 해결
# + 파일명 정리 및 Rename/FileNotFound 오류 방지
# + 다운로드 / 변환 진행상태 실시간 표시
# + 완료 후 로컬 PC 자동 다운로드
# ================================================================

import os
import re
import glob
import shutil
import subprocess
import sys
from google.colab import files, drive

# ================================================================
# ① 설정
# ================================================================

# 원하는 YouTube URL을 여기에 입력
VIDEO_URL = "https://www.youtube.com/watch?v=q7aAuDtEYco"

# 임시 다운로드 폴더 및 최종 저장 위치
TEMP_DIR = "/content/ytdlp_temp"
FINAL_DIR = "/content"

# ★ Google Drive 내 cookies.txt 위치
DRIVE_COOKIE_PATH = "/content/drive/MyDrive/youtubeckies/cookies.txt"

os.makedirs(TEMP_DIR, exist_ok=True)

# ------------------------------------------------
# 이전 실행의 임시 파일 완전 삭제
# ------------------------------------------------
for root, dirs, filenames in os.walk(TEMP_DIR, topdown=False):
    for filename in filenames:
        path = os.path.join(root, filename)
        try:
            os.remove(path)
        except:
            pass

    for dirname in dirs:
        path = os.path.join(root, dirname)
        try:
            shutil.rmtree(path)
        except:
            pass

print("=" * 70)
print("① yt-dlp / ffmpeg 패키지 준비")
print("=" * 70)

# ================================================================
# ② yt-dlp 및 ffmpeg 설치
# ================================================================

subprocess.run(["pip", "install", "-U", "yt-dlp[default]"], check=True)
subprocess.run(["apt-get", "update", "-qq"], check=True)
subprocess.run(["apt-get", "install", "-y", "-qq", "ffmpeg"], check=True)

print("✅ yt-dlp / ffmpeg 준비 완료")

# ================================================================
# ③ 구글 드라이브에서 cookies.txt 자동 읽기 (에러 방지 강화)
# ================================================================

print()
print("=" * 70)
print("② Google Drive에서 cookies.txt 로드")
print("=" * 70)

cookie_file = None

# 1단계: 이미 /content/drive/MyDrive 경로가 존재하는지 확인
if os.path.exists("/content/drive/MyDrive"):
    print("✅ 이미 Google Drive가 연결되어 있습니다.")
else:
    # 2단계: 연결이 안 되어 있다면 마운트 시도
    try:
        print("🔑 Google Drive 마운트를 시도합니다...")
        drive.mount('/content/drive', force_remount=False)
    except Exception as e:
        print(f"\n⚠️ 코드 자동 마운트 중 에러 발생: {e}")
        print("💡 [해결 팁] 화면 좌측의 '📁 파일 아이콘' -> '드라이브 마운트 버튼'을 직접 눌러서 연결해 보세요!")

# 파일 존재 여부 최종 확인
if os.path.isfile(DRIVE_COOKIE_PATH):
    cookie_file = DRIVE_COOKIE_PATH
    print(f"\n✅ Google Drive에서 cookies.txt 발견!")
    print(f"   📂 파일 경로: {cookie_file}")
else:
    print(f"\n⚠️ 지정된 구글 드라이브 경로에서 파일을 찾지 못했습니다:\n   {DRIVE_COOKIE_PATH}")

# 구글 드라이브 파일 로드 실패 시 수동 업로드 대체 진행
if cookie_file is None or not os.path.isfile(cookie_file):
    print("\n수동으로 cookies.txt 파일을 업로드해 주세요.\n")
    uploaded = files.upload()
    for filename in uploaded.keys():
        if filename.lower().endswith(".txt"):
            cookie_file = os.path.join("/content", filename)
            break

if cookie_file is None or not os.path.isfile(cookie_file):
    raise FileNotFoundError("❌ cookies.txt 파일을 찾을 수 없습니다.")

# ================================================================
# ④ cookies.txt 데이터 검증
# ================================================================

print()
print("=" * 70)
print("③ cookies.txt 내용 확인")
print("=" * 70)

with open(cookie_file, "r", encoding="utf-8", errors="ignore") as f:
    cookie_lines = f.readlines()

valid_cookie_lines = [
    line for line in cookie_lines
    if line.strip() and not line.startswith("#")
]

if len(valid_cookie_lines) == 0:
    raise ValueError("❌ cookies.txt 안에 유효한 쿠키 데이터가 없습니다.")

print(f"✅ 유효한 쿠키 항목: {len(valid_cookie_lines)}개")

# ================================================================
# ⑤ YouTube 다운로드 및 자막 자동 추출
# ================================================================

print()
print("=" * 70)
print("④ YouTube 다운로드 및 자막(Subtitles) 추출 시작")
print("=" * 70)

output_template = os.path.join(TEMP_DIR, "%(title)s_%(id)s.%(ext)s")

cmd = [
    "yt-dlp",
    "--cookies", cookie_file,
    "--js-runtimes", "deno",
    "--no-playlist",
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b",
    "--merge-output-format", "mp4",
    "--restrict-filenames",
    # ── 자막 자동 추출 옵션 추가 ──
    "--write-subs",               # 수동 자막 다운로드 시도
    "--write-auto-subs",          # 자동 생성 자막(ASR) 다운로드 허용
    "--sub-langs", "all",         # 모든 언어 자막 가져오기 (한국어/영어 등)
    "--convert-subs", "vtt",      # VTT 포맷으로 변환
    "-o", output_template,
    "--print", "after_move:filepath",
    VIDEO_URL
]

print("\n📥 다운로드 및 자막 추출 진행 중...\n")

process = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    encoding="utf-8",
    errors="replace"
)

stdout_lines = []
while True:
    output = process.stdout.readline()
    if output == '' and process.poll() is not None:
        break
    if output:
        clean_out = output.strip()
        stdout_lines.append(output)
        if "%" in clean_out or "Destination" in clean_out or "subtitle" in clean_out.lower():
            print(clean_out)

rc = process.poll()
full_stdout = "".join(stdout_lines)

if rc != 0:
    print(full_stdout)
    raise RuntimeError("\n❌ YouTube 다운로드 실패")

print("\n✅ YouTube 다운로드 및 자막 추출 성공")

# ================================================================
# ⑥ 추출된 자막 파일(.vtt) 탐색 및 확인
# ================================================================

print()
print("=" * 70)
print("⑤ 자막 파일(.vtt) 검색 및 텍스트 확인")
print("=" * 70)

sub_candidates = glob.glob(os.path.join(TEMP_DIR, "**", "*.vtt"), recursive=True)
target_vtt = None

# 한국어(ko) 또는 영어(en) 자막 우선 선택
for sub in sub_candidates:
    if ".ko." in sub or ".en." in sub:
        target_vtt = sub
        break

if not target_vtt and sub_candidates:
    target_vtt = sub_candidates[0]

if target_vtt:
    print(f"✅ 자막 파일 발견: {target_vtt}")
    print("\n--- [추출된 자막 미리보기 (처음 15줄)] ---")
    with open(target_vtt, "r", encoding="utf-8", errors="ignore") as f:
        vtt_content = f.read()
        preview_lines = vtt_content.splitlines()[:15]
        print("\n".join(preview_lines))
    print("----------------------------------------\n")
    
    # 자막 파일을 최종 폴더로 복사하여 로컬 다운로드 가능하도록 함
    final_vtt_path = os.path.join(FINAL_DIR, "extracted_subtitle.vtt")
    shutil.copy(target_vtt, final_vtt_path)
    print(f"📁 자막 파일 저장 완료: {final_vtt_path}")
else:
    print("⚠️ 추출된 자막 파일(.vtt)을 찾지 못했습니다. (영상의 자막 지원 여부 확인 필요)")

# ================================================================
# ⑦ 다운로드된 실제 영상 파일 검색 및 파일명 정리
# ================================================================

print()
print("=" * 70)
print("⑥ 영상 파일 탐색 및 파일명 정리")
print("=" * 70)

original_path = None
lines = [line.strip() for line in full_stdout.splitlines() if line.strip()]

for line in reversed(lines):
    if line.startswith(TEMP_DIR) and os.path.isfile(line.strip()):
        original_path = line.strip()
        break

if original_path is None:
    candidates = []
    for pattern in ["*.mp4", "*.mkv", "*.webm", "*.mov"]:
        candidates.extend(glob.glob(os.path.join(TEMP_DIR, "**", pattern), recursive=True))
    candidates = [f for f in candidates if os.path.isfile(f)]
    if candidates:
        original_path = max(candidates, key=os.path.getmtime)

if original_path is None:
    raise FileNotFoundError("다운로드된 영상 파일을 찾을 수 없습니다.")

original_path = os.path.abspath(original_path)
original_filename = os.path.basename(original_path)

name_without_ext, original_ext = os.path.splitext(original_filename)

clean_name = re.sub(r"[^A-Za-z0-9 _-]", "", name_without_ext)
clean_name = re.sub(r"\s+", "_", clean_name)
clean_name = re.sub(r"_+", "_", clean_name).strip("_") or "youtube_video"

final_path = os.path.join(FINAL_DIR, clean_name + ".mp4")

print(f"원본 파일명 : {original_filename}")
print(f"정리 파일명 : {clean_name}.mp4")

# ================================================================
# ⑧ MP4 변환 / 이동
# ================================================================

if original_ext.lower() == ".mp4":
    if os.path.abspath(original_path) != os.path.abspath(final_path):
        if os.path.exists(final_path):
            try:
                os.remove(final_path)
            except Exception:
                final_path = os.path.join(FINAL_DIR, clean_name + "_new.mp4")
        os.replace(original_path, final_path)
    print("\n✅ MP4 파일 이동 완료")
else:
    print(f"\n🔄 {original_ext} → MP4 변환 중 (FFmpeg)...")
    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", original_path,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        final_path
    ]
    conv_process = subprocess.Popen(
        ffmpeg_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace"
    )
    while True:
        out = conv_process.stdout.readline()
        if out == '' and conv_process.poll() is not None:
            break
        if out and ("frame=" in out or "time=" in out):
            sys.stdout.write(f"\r{out.strip()}")
            sys.stdout.flush()
    print()
    if os.path.exists(original_path):
        os.remove(original_path)
    print("✅ MP4 변환 완료")

# ================================================================
# ⑨ 로컬 PC로 파일 자동 다운로드 (영상 및 자막)
# ================================================================

print()
print("=" * 70)
print("⑦ 로컬 PC 자동 다운로드")
print("=" * 70)

if not os.path.isfile(final_path):
    raise FileNotFoundError("❌ 다운로드할 final_path 파일이 존재하지 않습니다.")

download_filename = os.path.basename(final_path)
download_size_mb = os.path.getsize(final_path) / (1024 * 1024)

print(f"다운로드 파일명 : {download_filename}")
print(f"파일 크기       : {download_size_mb:.2f} MB")
print("\n⬇️ 내 컴퓨터(로컬 PC)로 영상 다운로드를 시작합니다...")

# 로컬 PC 브라우저 다운로드 실행 (영상)
files.download(final_path)

# 자막 파일도 존재할 경우 함께 다운로드 안내
final_vtt_path = os.path.join(FINAL_DIR, "extracted_subtitle.vtt")
if os.path.isfile(final_vtt_path):
    print("⬇️ 자막 파일(extracted_subtitle.vtt) 다운로드를 시작합니다...")
    files.download(final_vtt_path)

print()
print("=" * 70)
print("🎉 모든 작업이 완료되었습니다!")
print("=" * 70)
print(f"📁 PC의 다운로드 폴더에서 영상 및 자막 파일(.vtt)을 확인하세요.")