export default {
  name: "ChallengeRecordsList",
  props: {
    name: {
      type: String,
      required: true
    },
    start: {
      type: Number,
      required: true
    },
    times: {
      type: Array,
      required: true
    },
    // 现实时间口径的对应记录；旧存档不含该字段时为空数组
    realTimes: {
      type: Array,
      required: false,
      default: () => []
    }
  },
  computed: {
    timeSum() {
      return this.times.sum();
    },
    completedAllChallenges() {
      return this.timeSum < Number.MAX_VALUE;
    },
    realRecordCount() {
      return this.realTimes.filter(t => t < Number.MAX_VALUE).length;
    },
    allRealRecorded() {
      return this.times.every((time, i) => time >= Number.MAX_VALUE || this.realTimes[i] < Number.MAX_VALUE);
    },
    realSum() {
      return this.realTimes.filter(t => t < Number.MAX_VALUE).sum();
    },
    sumText() {
      if (this.allRealRecorded) return timeStatText(this.realSum, this.timeSum);
      // 旧存档没有现实时间记录：只显示可确认的游戏内时间，并说明缺口，不做推算
      return `${timeStatText(undefined, this.timeSum)}（旧版记录未保存现实时间，仅 ${formatInt(this.realRecordCount)} 项有现实时间记录）`;
    }
  },
  methods: {
    timeDisplayShort,
    completionString(time, realTime) {
      const hasGame = time < Number.MAX_VALUE;
      const hasReal = typeof realTime === "number" && realTime < Number.MAX_VALUE;
      if (!hasGame && !hasReal) return "尚未完成";
      if (hasReal) return `时间纪录：${timeStatText(realTime, time)}`;
      // 只有旧版游戏内时间记录时，明确标注为历史数据，不推算现实时间
      return `时间纪录：${timeStatText(undefined, time)}（旧版记录，未保存现实时间）`;
    }
  },
  template: `
  <div>
    <br>
    <div
      v-for="(time, i) in times"
      :key="i"
    >
      <span>{{ name }} {{ start + i }} {{ completionString(time, realTimes[i]) }}</span>
    </div>
    <br>
    <div v-if="completedAllChallenges">
      {{ name }}时间纪录的总和是 {{ sumText }}
    </div>
    <div v-else>
      所有{{ name }}尚未完成
    </div>
  </div>
  `
};
