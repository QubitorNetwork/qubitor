package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

const defaultContext = "QUBITOR_ACCOUNT_V1"

type keygenOutput struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

func main() {
	if len(os.Args) < 2 {
		exitf("usage: mldsa65-tool <keygen|sign|verify>")
	}

	var err error
	switch os.Args[1] {
	case "keygen":
		err = runKeygen()
	case "sign":
		err = runSign(os.Args[2:])
	case "verify":
		err = runVerify(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		exitf("%v", err)
	}
}

func runKeygen() error {
	pk, sk, err := mldsa65.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}

	out := keygenOutput{
		PublicKey:  hexEncode(pk.Bytes()),
		PrivateKey: hexEncode(sk.Bytes()),
	}
	return json.NewEncoder(os.Stdout).Encode(out)
}

func runSign(args []string) error {
	fs := flag.NewFlagSet("sign", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	privateKeyHex := fs.String("private-key", "", "hex encoded ML-DSA-65 private key")
	messageHex := fs.String("message", "", "hex encoded message")
	context := fs.String("context", defaultContext, "ML-DSA context")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *privateKeyHex == "" || *messageHex == "" {
		return fmt.Errorf("sign requires --private-key and --message")
	}

	privateKeyBytes, err := hexDecode(*privateKeyHex)
	if err != nil {
		return fmt.Errorf("decode private key: %w", err)
	}
	message, err := hexDecode(*messageHex)
	if err != nil {
		return fmt.Errorf("decode message: %w", err)
	}

	var sk mldsa65.PrivateKey
	if err := sk.UnmarshalBinary(privateKeyBytes); err != nil {
		return fmt.Errorf("unmarshal private key: %w", err)
	}

	signature := make([]byte, mldsa65.SignatureSize)
	if err := mldsa65.SignTo(&sk, message, []byte(*context), false, signature); err != nil {
		return err
	}
	fmt.Println(hexEncode(signature))
	return nil
}

func runVerify(args []string) error {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	publicKeyHex := fs.String("public-key", "", "hex encoded ML-DSA-65 public key")
	messageHex := fs.String("message", "", "hex encoded message")
	signatureHex := fs.String("signature", "", "hex encoded signature")
	context := fs.String("context", defaultContext, "ML-DSA context")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *publicKeyHex == "" || *messageHex == "" || *signatureHex == "" {
		return fmt.Errorf("verify requires --public-key, --message, and --signature")
	}

	publicKeyBytes, err := hexDecode(*publicKeyHex)
	if err != nil {
		return fmt.Errorf("decode public key: %w", err)
	}
	message, err := hexDecode(*messageHex)
	if err != nil {
		return fmt.Errorf("decode message: %w", err)
	}
	signature, err := hexDecode(*signatureHex)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}

	var pk mldsa65.PublicKey
	if err := pk.UnmarshalBinary(publicKeyBytes); err != nil {
		return fmt.Errorf("unmarshal public key: %w", err)
	}

	fmt.Println(mldsa65.Verify(&pk, message, []byte(*context), signature))
	return nil
}

func hexEncode(value []byte) string {
	return "0x" + hex.EncodeToString(value)
}

func hexDecode(value string) ([]byte, error) {
	value = strings.TrimPrefix(value, "0x")
	if len(value)%2 != 0 {
		value = "0" + value
	}
	return hex.DecodeString(value)
}

func exitf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
