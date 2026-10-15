import { PhoneNotices } from "./notifications";

export function Phone({ now }: { now: number }) {
  return (
    <div className="hdPhone">
      <i className="btn r" />
      <i className="btn l1" />
      <i className="btn l2" />
      <div className="hdPhoneScreen">
        <div className="bar">
          <span>4:32</span>
          <span className="sys">
            <svg width="15" height="10" viewBox="0 0 18 12" fill="#f4f4f6">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5" width="3" height="7" rx="1" />
              <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg width="14" height="10" viewBox="0 0 16 12" fill="#f4f4f6">
              <path d="M8 2.5c2.4 0 4.6.9 6.2 2.4l1.3-1.4A11 11 0 0 0 8 .5 11 11 0 0 0 .5 3.5l1.3 1.4A8.7 8.7 0 0 1 8 2.5zm0 3.4c1.5 0 2.9.6 3.9 1.5l1.3-1.4A8 8 0 0 0 8 3.6a8 8 0 0 0-5.2 2.3l1.3 1.4A5.7 5.7 0 0 1 8 5.9zm0 3.3c.7 0 1.4.3 1.9.8L8 12l-1.9-2c.5-.5 1.2-.8 1.9-.8z" />
            </svg>
            <span className="batt">
              <i />
            </span>
          </span>
        </div>
        <span className="island" />
        <div className="date">Tuesday, July 14</div>
        <div className="clock">4:32</div>
        <PhoneNotices now={now} />
        <span className="home" />
      </div>
    </div>
  );
}
