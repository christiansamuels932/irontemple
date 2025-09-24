<?php
// IT-PHP-200 — LAST ENDPOINT (read most recent entries)
// Returns JSON { ok:true, entries:[...] }
header('Content-Type: application/json; charset=utf-8');

function fail($code,$msg,$http=400){
    http_response_code($http);
    echo json_encode(['ok'=>false,'code'=>$code,'msg'=>$msg], JSON_UNESCAPED_SLASHES);
    exit;
}

try{
    $store = __DIR__ . '/storage';
    if(!is_dir($store)) fail('IT-PHP-201','storage missing',500);

    $limit = isset($_GET['limit']) ? max(1,min(50,(int)$_GET['limit'])) : 3;

    // find newest log file(s)
    $files = glob($store.'/log-*.jsonl');
    if(!$files) fail('IT-PHP-202','no log files yet',200);
    rsort($files,SORT_STRING);

    $entries = [];
    foreach($files as $f){
        $lines = @file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if(!$lines) continue;
        // from the bottom backwards
        for($i=count($lines)-1;$i>=0;$i--){
            $j = json_decode($lines[$i],true);
            if($j) $entries[]=$j;
            if(count($entries)>=$limit) break 2;
        }
    }

    echo json_encode(['ok'=>true,'entries'=>$entries], JSON_UNESCAPED_SLASHES);
}catch(Throwable $e){
    fail('IT-PHP-299','fatal: '.$e->getMessage(),500);
}
