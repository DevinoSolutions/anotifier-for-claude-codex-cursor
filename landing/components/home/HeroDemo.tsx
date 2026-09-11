const notifCard: React.CSSProperties = {
  position: "absolute",
  right: "56px",
  width: "min(330px,58%)",
  display: "flex",
  gap: "13px",
  alignItems: "center",
  background: "rgba(32,33,37,0.97)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "14px",
  padding: "14px 16px",
  boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
  backdropFilter: "blur(8px)",
  zIndex: 3,
};

const notifIcon: React.CSSProperties = {
  display: "inline-flex",
  width: "40px",
  height: "40px",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f4f6",
  borderRadius: "10px",
  flex: "none",
};

export default function HeroDemo() {
  return (
    <div
      className="heroMockInner"
      style={{ display: "flex", alignItems: "flex-end" }}
    >
      {/* Laptop */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          marginRight: "-40px",
          filter: "drop-shadow(0 34px 60px rgba(0,0,0,0.55))",
        }}
      >
        <div
          style={{
            position: "relative",
            background: "linear-gradient(180deg,#2e3136,#1b1d21)",
            borderRadius: "20px 20px 0 0",
            padding: "10px 10px 14px",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "3.5px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "5px",
              height: "5px",
              borderRadius: "9999px",
              background: "#0a0b0d",
            }}
          />
          <div
            style={{
              position: "relative",
              minHeight: "348px",
              background:
                "radial-gradient(120% 110% at 28% 0%, #181c24 0%, #0a0b0e 62%)",
              borderRadius: "10px",
              overflow: "hidden",
              border: "1px solid #0a0b0d",
            }}
          >
            {/* Title bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 14px",
                background: "rgba(255,255,255,0.05)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontFamily: "var(--font-mono-stack)",
                fontSize: "10px",
                color: "#9c9c9d",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "9999px",
                    background: "#59d499",
                  }}
                />
                anotifier · notifications armed
              </span>
              <span>Wed 4:32 PM</span>
            </div>

            {/* Chat window */}
            <div
              style={{
                position: "absolute",
                left: "14px",
                top: "44px",
                width: "min(300px,54%)",
                background: "#121114",
                border: "1px solid #2a282e",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderBottom: "1px solid #1f1d23",
                }}
              >
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "9999px",
                    background: "#ff6157",
                  }}
                />
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "9999px",
                    background: "#febc2e",
                  }}
                />
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "9999px",
                    background: "#28c840",
                  }}
                />
                <img
                  src="/assets/icons/claude.png"
                  alt=""
                  width="13"
                  height="13"
                  style={{ marginLeft: "8px", borderRadius: "3px" }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    color: "#9c9c9d",
                  }}
                >
                  Claude Code
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono-stack)",
                    fontSize: "8.5px",
                    color: "#59d499",
                    background: "rgba(89,212,153,0.1)",
                    padding: "1px 6px",
                    borderRadius: "4px",
                  }}
                >
                  agent
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px",
                  minHeight: "172px",
                }}
              >
                <div
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "88%",
                    background: "#28262d",
                    borderRadius: "11px 11px 3px 11px",
                    padding: "7px 11px",
                    fontSize: "11px",
                    lineHeight: 1.5,
                    color: "#f4f4f6",
                    animation: "tl1 8s infinite",
                  }}
                >
                  Refactor the auth module
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    fontSize: "11px",
                    color: "#9c9c9d",
                    animation: "tl2 8s infinite",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "9999px",
                      background: "#d97757",
                    }}
                  />
                  Running tools…
                </div>
                <div
                  style={{
                    alignSelf: "flex-start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    background: "#1a181e",
                    border: "1px solid #2a282e",
                    borderRadius: "7px",
                    padding: "5px 9px",
                    fontFamily: "var(--font-mono-stack)",
                    fontSize: "10px",
                    color: "#9c9c9d",
                    animation: "tl3 8s infinite",
                  }}
                >
                  <span style={{ color: "#57c1ff" }}>session.ts</span>
                  <span style={{ color: "#59d499" }}>+214</span>
                  <span style={{ color: "#ff6157" }}>−96</span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9c9c9d",
                    animation: "tl4 8s infinite",
                  }}
                >
                  <span style={{ color: "#59d499" }}>✓</span> 14 tests passing
                </div>
                <div
                  style={{
                    maxWidth: "92%",
                    background: "rgba(89,212,153,0.07)",
                    border: "1px solid rgba(89,212,153,0.22)",
                    borderRadius: "11px 11px 11px 3px",
                    padding: "7px 11px",
                    fontSize: "11px",
                    lineHeight: 1.5,
                    color: "#e8e8e8",
                    animation: "tl5 8s infinite, doneFlash 8s infinite",
                  }}
                >
                  Done — auth module refactored{" "}
                  <span
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: "13px",
                      height: "13px",
                      verticalAlign: "-2px",
                      marginLeft: "2px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "13px",
                        height: "13px",
                        margin: "-6.5px 0 0 -6.5px",
                        border: "1px solid #ffc533",
                        borderRadius: "9999px",
                        animation: "bellRing 8s infinite",
                      }}
                    />
                    <span
                      style={{
                        position: "relative",
                        display: "inline-block",
                        color: "#ffc533",
                        animation: "bellShake 8s infinite",
                        transformOrigin: "50% 20%",
                      }}
                    >
                      ♪
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* [ desktop toast ] tag */}
            <span
              style={{
                position: "absolute",
                top: "24px",
                right: "58px",
                fontFamily: "var(--font-mono-stack)",
                fontSize: "9.5px",
                color: "#59d499",
                letterSpacing: "0.5px",
                zIndex: 3,
                animation: "tagIn 8s infinite",
              }}
            >
              [ desktop toast ]
            </span>

            {/* Claude toast */}
            <div
              style={{
                ...notifCard,
                top: "44px",
                animation: "toastIn 8s infinite",
              }}
            >
              <span style={notifIcon}>
                <img
                  src="/assets/icons/claude.png"
                  alt="Claude Code"
                  width="36"
                  height="36"
                  style={{ borderRadius: "8px", objectFit: "contain" }}
                />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#f4f4f6",
                  }}
                >
                  Claude Code{" "}
                  <span
                    style={{
                      fontWeight: 400,
                      color: "#838a92",
                      fontSize: "11px",
                      flex: "none",
                    }}
                  >
                    now
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    lineHeight: 1.45,
                    color: "#cdcdcd",
                  }}
                >
                  Task complete — refactored auth module, 14 tests passing
                </div>
              </div>
            </div>

            {/* Codex webhook toast */}
            <div
              style={{
                ...notifCard,
                top: "146px",
                animation: "webhookIn 8s infinite",
              }}
            >
              <span style={notifIcon}>
                <img
                  src="/assets/icons/codex.png"
                  alt="Codex"
                  width="30"
                  height="30"
                  style={{ borderRadius: "6px", objectFit: "contain" }}
                />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#f4f4f6",
                  }}
                >
                  Codex{" "}
                  <span
                    style={{
                      background: "rgba(255,197,51,0.15)",
                      color: "#ffc533",
                      fontSize: "10px",
                      fontWeight: 500,
                      fontFamily: "var(--font-mono-stack)",
                      padding: "1px 7px",
                      borderRadius: "4px",
                      flex: "none",
                      alignSelf: "center",
                    }}
                  >
                    urgent
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    lineHeight: 1.45,
                    color: "#cdcdcd",
                  }}
                >
                  Needs your input — allow{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono-stack)",
                      fontSize: "11.5px",
                    }}
                  >
                    npm test
                  </span>
                  ?
                </div>
              </div>
            </div>

            {/* Cursor toast */}
            <div
              style={{
                ...notifCard,
                top: "246px",
                animation: "cursorIn 8s infinite",
              }}
            >
              <span style={notifIcon}>
                <img
                  src="/assets/icons/cursor.png"
                  alt="Cursor"
                  width="40"
                  height="40"
                  style={{ borderRadius: "10px", objectFit: "cover" }}
                />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#f4f4f6",
                  }}
                >
                  Cursor{" "}
                  <span
                    style={{
                      fontWeight: 400,
                      color: "#838a92",
                      fontSize: "11px",
                      flex: "none",
                    }}
                  >
                    now
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    lineHeight: 1.45,
                    color: "#cdcdcd",
                  }}
                >
                  Agent finished — review 3 edits in src/auth
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Laptop base */}
        <div
          style={{
            position: "relative",
            height: "15px",
            background: "linear-gradient(180deg,#3d4045,#212327)",
            borderRadius: "2px 2px 16px 16px",
            margin: "0 -14px",
            borderTop: "1px solid #4d5055",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "110px",
              height: "8px",
              background: "linear-gradient(180deg,#17181b,#26282c)",
              borderRadius: "0 0 10px 10px",
            }}
          />
        </div>
      </div>

      {/* Phone */}
      <div
        style={{
          flex: "none",
          width: "min(212px,46%)",
          position: "relative",
          zIndex: 4,
          background: "#0b0c0f",
          border: "2px solid #3a3d42",
          borderRadius: "34px",
          padding: "8px",
          boxShadow: "0 28px 70px rgba(0,0,0,0.65)",
        }}
      >
        <span
          style={{
            position: "absolute",
            right: "-5px",
            top: "88px",
            width: "3px",
            height: "56px",
            background: "#3a3d42",
            borderRadius: "2px",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "-5px",
            top: "72px",
            width: "3px",
            height: "26px",
            background: "#3a3d42",
            borderRadius: "2px",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "-5px",
            top: "108px",
            width: "3px",
            height: "42px",
            background: "#3a3d42",
            borderRadius: "2px",
          }}
        />
        <div
          style={{
            position: "relative",
            background:
              "linear-gradient(165deg,#1c2a3a 0%,#0e1723 52%,#0a0b0e 100%)",
            borderRadius: "26px",
            overflow: "hidden",
            minHeight: "352px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "9px 20px 0",
              fontSize: "11px",
              fontWeight: 600,
              color: "#f4f4f6",
            }}
          >
            <span>4:32</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <svg width="15" height="10" viewBox="0 0 18 12" fill="#f4f4f6">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5" width="3" height="7" rx="1" />
                <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg width="14" height="10" viewBox="0 0 16 12" fill="#f4f4f6">
                <path d="M8 2.5c2.4 0 4.6.9 6.2 2.4l1.3-1.4A11 11 0 0 0 8 .5 11 11 0 0 0 .5 3.5l1.3 1.4A8.7 8.7 0 0 1 8 2.5zm0 3.4c1.5 0 2.9.6 3.9 1.5l1.3-1.4A8 8 0 0 0 8 3.6a8 8 0 0 0-5.2 2.3l1.3 1.4A5.7 5.7 0 0 1 8 5.9zm0 3.3c.7 0 1.4.3 1.9.8L8 12l-1.9-2c.5-.5 1.2-.8 1.9-.8z" />
              </svg>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <span
                  style={{
                    width: "17px",
                    height: "9px",
                    border: "1px solid rgba(255,255,255,0.6)",
                    borderRadius: "2.5px",
                    padding: "1.5px",
                    display: "inline-flex",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      background: "#59d499",
                      borderRadius: "1px",
                    }}
                  />
                </span>
              </span>
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "-11px",
            }}
          >
            <span
              style={{
                width: "76px",
                height: "20px",
                background: "#000",
                borderRadius: "9999px",
              }}
            />
          </div>
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.72)",
                fontWeight: 500,
              }}
            >
              Tuesday, July 14
            </div>
            <div
              style={{
                fontSize: "52px",
                fontWeight: 300,
                color: "#fff",
                letterSpacing: "-1.5px",
                lineHeight: 1.02,
              }}
            >
              4:32
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "9px",
              padding: "20px 9px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                background: "rgba(72,74,82,0.44)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "18px",
                padding: "10px 12px",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
                animation: "phoneIn 8s infinite",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  width: "30px",
                  height: "30px",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f4f4f6",
                  borderRadius: "7px",
                  flex: "none",
                }}
              >
                <img
                  src="/assets/icons/claude.png"
                  alt=""
                  width="30"
                  height="30"
                  style={{ borderRadius: "7px", objectFit: "contain" }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 600,
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    Claude Code
                  </span>
                  <span
                    style={{
                      fontSize: "9.5px",
                      color: "rgba(255,255,255,0.55)",
                      flex: "none",
                    }}
                  >
                    now
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#fff",
                    marginTop: "2px",
                  }}
                >
                  Task complete
                </div>
                <div
                  style={{
                    fontSize: "11.5px",
                    lineHeight: 1.35,
                    color: "rgba(255,255,255,0.82)",
                  }}
                >
                  Refactored auth module, 14 tests passing
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                background: "rgba(72,74,82,0.44)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "18px",
                padding: "10px 12px",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
                animation: "ph2In 8s infinite",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  width: "30px",
                  height: "30px",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f4f4f6",
                  borderRadius: "7px",
                  flex: "none",
                }}
              >
                <img
                  src="/assets/icons/codex.png"
                  alt=""
                  width="26"
                  height="26"
                  style={{ borderRadius: "5px", objectFit: "contain" }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 600,
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    Codex
                  </span>
                  <span
                    style={{
                      fontSize: "8.5px",
                      fontWeight: 600,
                      fontFamily: "var(--font-mono-stack)",
                      color: "#ffc533",
                      background: "rgba(255,197,51,0.16)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      flex: "none",
                    }}
                  >
                    urgent
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#fff",
                    marginTop: "2px",
                  }}
                >
                  Needs your input
                </div>
                <div
                  style={{
                    fontSize: "11.5px",
                    lineHeight: 1.35,
                    color: "rgba(255,255,255,0.82)",
                  }}
                >
                  Allow codex to run npm test?
                </div>
              </div>
            </div>
          </div>
          <span
            style={{
              position: "absolute",
              bottom: "7px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "78px",
              height: "4px",
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.55)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
