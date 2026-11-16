import assert from 'node:assert/strict';
import test from 'node:test';
import {createThrow,sampleThrow} from '../games/yut/toss.mjs';

test('each stick rocks back after its bounce, then rests on the rolled face',()=>{
  for(let seed=0;seed<64;seed++){
    const faces=[0,1,2,3].map(i=>(seed>>i)&1);
    const plan=createThrow(faces,seed);
    for(const rod of plan.rods){
      const touchdown=rod.delay+rod.flight+rod.bounce;
      const sample=fraction=>sampleThrow(plan,touchdown+(rod.finish-touchdown)*fraction)[rod.index];
      const left=sample(1/6),right=sample(1/2),last=sample(5/6);
      for(const pose of [left,right,last]){
        assert.equal(pose.arc,0);
        assert.ok(Math.abs(pose.yaw-rod.yaw)<.055);
      }
      assert.ok((left.yaw-rod.yaw)*(right.yaw-rod.yaw)<0);
      assert.ok((right.yaw-rod.yaw)*(last.yaw-rod.yaw)<0);
      assert.ok(Math.abs(last.yaw-rod.yaw)<Math.abs(left.yaw-rod.yaw)*.5);
      const rest=sample(1),later=sample(2);
      assert.equal(rest.roll,rod.face===1?0:Math.PI);
      assert.deepEqual([rest.roll,rest.pitch,rest.yaw],[later.roll,later.pitch,later.yaw]);
    }
  }
});
