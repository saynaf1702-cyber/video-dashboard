#!/bin/bash
echo "=== Cleanup dimulai: $(date) ==="

# 1. Hapus file .mp4 rekaman penuh lebih dari 5 hari
sudo find /home/isrdds/video-dashboard/recordings -name "*.mp4" -mtime +5 -delete
echo "✅ File rekaman VOD > 5 hari dihapus"

# 2. Hapus data rekaman VOD di database lebih dari 5 hari
docker exec video-dashboard-database-1 psql -U postgres -d video_analytics -c "
DELETE FROM recordings 
WHERE is_clip = FALSE 
AND created_at < NOW() - INTERVAL '5 days';
"
echo "✅ Data rekaman VOD > 5 hari dihapus dari database"

# 3. Hapus data klip anomali di database lebih dari 30 hari
docker exec video-dashboard-database-1 psql -U postgres -d video_analytics -c "
DELETE FROM recordings 
WHERE is_clip = TRUE 
AND created_at < NOW() - INTERVAL '30 days';
"
echo "✅ Data klip anomali > 30 hari dihapus dari database"

# 4. Hapus data reports lebih dari 7 hari
docker exec video-dashboard-database-1 psql -U postgres -d video_analytics -c "
DELETE FROM reports 
WHERE created_at < NOW() - INTERVAL '7 days';
"
echo "✅ Data reports > 7 hari dihapus dari database"

echo "=== Cleanup selesai: $(date) ==="