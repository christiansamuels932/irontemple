<?php
// IT-PHP-100 — LOG ENDPOINT (append JSON lines to /storage)
// Response is always JSON.
header('Content-Type: application/json; charset=utf-8');

function fail($code,$msg,$http=400){
  http_response_code($http);
  echo json_encode(['ok'=>false,'code'=>$code,'msg'=>$msg], JSON_UNESCAPED_SLASHES);
  exit;
}

try{
  // 1) Paths
  $root = __DIR__;                 // Irontemple/
  $store = $root . '/storage';
  if(!is_dir($store)){
    if(!mkdir($store, 0775, true)){
      fail('IT-PHP-101', 'cannot create storage folder', 500);
    }
  }
  if(!is_writable($store)){
    fail('IT-PHP-102', 'storage not writable', 500);
  }

  // 2) Read JSON body
  $raw = file_get_contents('php://input');
  if($raw === false){
    fail('IT-PHP-103', 'cannot read input stream', 400);
  }
  $j = json_decode($raw, true);
  if(!is_array($j)){
    fail('IT-PHP-104', 'invalid JSON', 400);
  }

  // 3) Minimal sanitize + defaults
  $entry = [
    't' => isset($j['t']) && is_numeric($j['t']) ? (int)$j['t'] : (int)(microtime(true)*1000),
    'ev'=> isset($j['ev']) ? substr((string)$j['ev'],0,64) : 'event',
    'ex'=> isset($j['ex']) ? substr((string)$j['ex'],0,64) : null,
    'prepCount'=> isset($j['prepCount']) ? (int)$j['prepCount'] : null,
    'kg'=> isset($j['kg']) ? (float)$j['kg'] : null,
    'notes'=> isset($j['notes']) ? substr((string)$j['notes'],0,2000) : null,
    'ua'=> $_SERVER['HTTP_USER_AGENT'] ?? null,
    'ip'=> $_SERVER['REMOTE_ADDR'] ?? null,
    'createdAt'=> date('c'),
  ];

  // 4) File per day, append line
  $day = date('Ymd');
  $file = $store . "/log-$day.jsonl";

  // Ensure file exists and has sane perms
  if(!file_exists($file)){
    if(false === @file_put_contents($file, "")){
      fail('IT-PHP-105', 'cannot create log file', 500);
    }
    @chmod($file, 0664);
  }

  $line = json_encode($entry, JSON_UNESCAPED_SLASHES) . "\n";
  $ok = @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
  if($ok === false){
    fail('IT-PHP-106', 'cannot write log line', 500);
  }

  echo json_encode(['ok'=>true,'code'=>'IT-PHP-100-OK','file'=>basename($file)], JSON_UNESCAPED_SLASHES);
}catch(Throwable $e){
  fail('IT-PHP-199', 'fatal: '.$e->getMessage(), 500);
}
