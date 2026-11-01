// 对稳定 ID 进行可逆 UTF-8 编码，避免 URL 百分号解码改变文内锚点；不是内容 hash。
export const anchor=(id:string)=>'ed-'+Array.from(new TextEncoder().encode(id),b=>b.toString(16).padStart(2,'0')).join('');
