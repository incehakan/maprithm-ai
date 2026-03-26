SELECT
  a.pid,
  a.usename,
  a.application_name,
  a.client_addr,
  a.state,
  a.query,
  l.locktype,
  l.granted,
  l.classid,
  l.objid,
  l.objsubid
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.locktype = 'advisory'
ORDER BY l.granted DESC, a.pid ASC;

