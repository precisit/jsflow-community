// jsflow join tickets in Go, standard library only. A ticket is an HS256 JWT signed with an app's SECRET key (sk_...):
//
//	header  {alg: "HS256", typ: "JWT", kid: <the key's id>}     (kid lets two keys be active while you rotate)
//	claims  {app, room, sub, iat, exp, region?}                  (sub: your user's id; exp: at most 10 minutes ahead)
//
// The HMAC key is the bytes of the full sk_... string. The service verifies the ticket; it never calls you.
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

type Params struct {
	SecretKey  string `json:"secretKey"`
	KeyID      string `json:"keyId"`
	App        string `json:"app"`
	Room       string `json:"room"`
	Sub        string `json:"sub"`
	Region     string `json:"region"`
	TTLSeconds int    `json:"ttlSeconds"` // 0: 300
	IAT        int64  `json:"iat"`        // seconds since the epoch; 0: now
}

type header struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
	Kid string `json:"kid"`
}

// The field order is the order in the ticket, the same as the Node and Python examples.
type claims struct {
	App    string `json:"app"`
	Room   string `json:"room"`
	Sub    string `json:"sub"`
	IAT    int64  `json:"iat"`
	EXP    int64  `json:"exp"`
	Region string `json:"region,omitempty"`
}

var (
	appRe  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)
	roomRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

// toJSON is compact and keeps UTF-8 and <, >, & as they are (encoding/json escapes them by default).
func toJSON(v any) []byte {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return bytes.TrimRight(b.Bytes(), "\n")
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func MintTicket(p Params) (string, error) {
	switch {
	case !strings.HasPrefix(p.SecretKey, "sk_") || len(p.SecretKey) < 20:
		return "", errors.New("secretKey must be the app's sk_... secret key")
	case !strings.HasPrefix(p.KeyID, "key_"):
		return "", errors.New("keyId must be the secret key's id (key_...)")
	case !appRe.MatchString(p.App):
		return "", errors.New("app: lower case letters, digits and -, 1 to 32 characters")
	case !roomRe.MatchString(p.Room):
		return "", errors.New("room: letters, digits, _ and -, 1 to 64 characters")
	case p.Sub == "" || len(p.Sub) > 256:
		return "", errors.New("sub: your user id, 1 to 256 bytes of UTF-8")
	}
	ttl := p.TTLSeconds
	if ttl == 0 {
		ttl = 300
	}
	if ttl < 1 || ttl > 600 {
		return "", errors.New("ttlSeconds: 1 to 600 (a ticket may live at most 10 minutes)")
	}
	iat := p.IAT
	if iat == 0 {
		iat = time.Now().Unix()
	}
	signingInput := b64(toJSON(header{"HS256", "JWT", p.KeyID})) + "." +
		b64(toJSON(claims{p.App, p.Room, p.Sub, iat, iat + int64(ttl), p.Region}))
	mac := hmac.New(sha256.New, []byte(p.SecretKey))
	mac.Write([]byte(signingInput))
	return signingInput + "." + b64(mac.Sum(nil)), nil
}
