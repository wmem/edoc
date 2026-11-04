export const waveformTags:Record<string,any>={
 waveform:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
};
export const waveformTargets={waveform:['waveform']} as const;
export const waveformResources={waveforms:'waveform'} as const;
