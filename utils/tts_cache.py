import os
import tempfile
import hashlib
import time
import glob

# TTS Languages for gTTS
TTS_VOICES = {
    'th': 'th',   # ภาษาไทย
    'en': 'en',   # ภาษาอังกฤษ
}

# TTS Cache System
TTS_CACHE_DIR = os.path.join(tempfile.gettempdir(), 'discord_tts_cache')
TTS_CACHE_MAX_SIZE_MB = 100  # ขนาด cache สูงสุด (MB)
TTS_CACHE_MAX_AGE_HOURS = 24  # อายุ cache สูงสุด (ชั่วโมง)

# สร้างโฟลเดอร์ cache
os.makedirs(TTS_CACHE_DIR, exist_ok=True)


def get_cache_key(text: str, lang: str) -> str:
    """สร้าง hash key สำหรับ cache"""
    content = f"{text}|{lang}"
    return hashlib.md5(content.encode()).hexdigest()


def get_cache_path(cache_key: str) -> str:
    """ได้ path ของไฟล์ cache"""
    return os.path.join(TTS_CACHE_DIR, f"{cache_key}.mp3")


def get_cached_tts(text: str, lang: str) -> str | None:
    """ดึง TTS จาก cache (ถ้ามี)"""
    cache_key = get_cache_key(text, lang)
    cache_path = get_cache_path(cache_key)
    
    if os.path.exists(cache_path):
        # อัปเดต access time
        os.utime(cache_path, None)
        return cache_path
    return None


def save_to_cache(text: str, lang: str, temp_path: str) -> str:
    """บันทึก TTS ลง cache"""
    cache_key = get_cache_key(text, lang)
    cache_path = get_cache_path(cache_key)
    
    try:
        import shutil
        shutil.copy2(temp_path, cache_path)
        return cache_path
    except:
        return temp_path


def cleanup_tts_cache():
    """ล้าง cache ที่เก่าเกินไปหรือขนาดเกิน"""
    try:
        cache_files = glob.glob(os.path.join(TTS_CACHE_DIR, '*.mp3'))
        
        # ลบไฟล์ที่เก่าเกินไป
        current_time = time.time()
        max_age_seconds = TTS_CACHE_MAX_AGE_HOURS * 3600
        
        for filepath in cache_files:
            try:
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > max_age_seconds:
                    os.unlink(filepath)
            except:
                pass
        
        # ตรวจสอบขนาดรวม และลบไฟล์เก่าสุดถ้าเกิน
        cache_files = glob.glob(os.path.join(TTS_CACHE_DIR, '*.mp3'))
        total_size = sum(os.path.getsize(f) for f in cache_files if os.path.exists(f))
        max_size_bytes = TTS_CACHE_MAX_SIZE_MB * 1024 * 1024
        
        if total_size > max_size_bytes:
            # เรียงตาม access time (เก่าสุดก่อน)
            cache_files.sort(key=lambda x: os.path.getatime(x))
            
            for filepath in cache_files:
                if total_size <= max_size_bytes * 0.8:  # ลบจนเหลือ 80%
                    break
                try:
                    file_size = os.path.getsize(filepath)
                    os.unlink(filepath)
                    total_size -= file_size
                except:
                    pass
    except Exception as e:
        print(f"Cache cleanup error: {e}")


def get_cache_stats() -> dict:
    """ดูสถิติ cache"""
    try:
        cache_files = glob.glob(os.path.join(TTS_CACHE_DIR, '*.mp3'))
        total_size = sum(os.path.getsize(f) for f in cache_files if os.path.exists(f))
        return {
            'count': len(cache_files),
            'size_mb': round(total_size / (1024 * 1024), 2),
            'max_size_mb': TTS_CACHE_MAX_SIZE_MB
        }
    except:
        return {'count': 0, 'size_mb': 0, 'max_size_mb': TTS_CACHE_MAX_SIZE_MB}
