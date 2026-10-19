// 로컬 개발용 합성 데이터. 지정한 에뮬레이터 외에는 실행하지 않습니다.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8189'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9198')throw Error('Isolated emulator only');
initializeApp({projectId:'demo-orider-club-meetings'});
(async()=>{
 const db=getFirestore();const now=Date.now();
 for(const [uid,name] of [['club-owner','동호회장'],['club-host','주최라이더'],['club-rider','참석라이더'],['club-waiter','대기라이더'],['club-outsider','외부라이더']]){
  try{await getAuth().createUser({uid,email:uid+'@club.test',password:'club-test-2026',displayName:name,emailVerified:true})}catch(e){if(e.code!=='auth/uid-already-exists')throw e}
  await getAuth().updateUser(uid,{providerToLink:{uid:uid+'-google',providerId:'google.com',email:uid+'@club.test',displayName:name}});
  await db.doc('users/'+uid).set({nickname:name,displayName:name,createdAt:now,defaultVisibility:'everyone',status:'active'});
  await db.doc('users_public/'+uid).set({nickname:name,displayName:name,photoURL:null});
  if(uid!=='club-outsider')await db.doc('groups/club-development/members/'+uid).set({userId:uid,status:'active',role:uid==='club-owner'?'leader':'member',joinedAt:now,nickname:name});
 }
 await db.doc('groups/club-development').set({name:'오라이더 개발 동호회',description:'로컬 기능 검증용 동호회',creatorId:'club-owner',createdAt:now,isActive:true,visibility:'public',kind:'cycling',sports:['bike'],memberCount:4,city:'분당',rules:'서로 배려하며 안전하게 라이딩합니다.'});
 const pts=[{lat:37.385,lon:127.12,alt:80},{lat:37.39,lon:127.13,alt:100},{lat:37.397,lon:127.135,alt:140},{lat:37.405,lon:127.14,alt:100},{lat:37.41,lon:127.15,alt:85},{lat:37.415,lon:127.16,alt:90}];
 await db.doc('courses/club-local-course').set({name:'탄천 회복 라이딩',title:'탄천 회복 라이딩',userId:'club-owner',visibility:'public',deletedAt:null,createdAt:now,updatedAt:now,distance:6200,elevationGain:85,trackPoints:pts,elevationProfile:pts.map((p,i)=>({d:i*1240,e:p.alt})),waypoints:[{name:'공원 보급',type:'supply',latitude:37.397,longitude:127.135,distanceFromStartMeters:2480},{name:'카페 재집결',type:'cafe',latitude:37.41,longitude:127.15,distanceFromStartMeters:4960}]});
 console.log('Seeded isolated demo users, club-development, club-local-course');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
