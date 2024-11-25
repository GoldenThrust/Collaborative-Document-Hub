import User from "../models/user.js";
import { hash, verify } from "argon2";
import { createToken } from "../middlewares/tokenManager.js";
import { COOKIE_NAME, hostUrl } from "../utils/constants.js";
import mail from "../config/mail.js";
import { redisDB } from "../config/db.js";
import {v7 as uuid} from 'uuid';
import fs from "fs";
import createOTP from "../utils/functions.js";

class AuthenticationController {
    async verify(req, res) {
        try {
            const user = req.user;

            const { fullname, email, image } = user;

            return res
                .status(200)
                .json({ status: "OK", response: { fullname, email, image } });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ status: "ERROR", data: "Internal Server Error" });
        }
    }

    async updateProfilePics(req, res) {
        const user = req.user;
        const { fullname, password } = user;

        if (fullname) user.fullname = fullname;
        if (password) user.password = await hash(password);

        if (fs.existsSync(user.image)) {
            fs.unlinkSync(user.image);
        }

        let image = '';
        if (req.file)
            image = req.file.path;

        if (image)
            user.image = image

        user.save()
        return res.status(200).json({ status: "OK" });
    }


    async register(req, res) {
        try {
            const { fullname, email, password } = req.body;
            let image = '';
            if (req.file) {
                image = req.file.path;
            }

            const existingUser = await User.findOne({ email });

            if (existingUser) {
                return res.status(403).json({ status: "ERROR", response: "User already registered" });
            }

            const hashedPassword = await hash(password);
            const otp = createOTP();

            const user = { fullname, email, password: hashedPassword, image, otp }
            const crypto = uuid();

            await redisDB.set(`otp_${crypto}`, JSON.stringify(user), 24 * 60 * 60)


            try {
                await mail.sendOTP(user, crypto)
            } catch (error) {
                console.error(error);
                return res.status(500).json({ status: "ERROR", response: "Failed to send activation link" });
            }

            return res
                .status(201)
                .json({ status: "OK", response: "We've sent an otp to your email. Please check your inbox to activate your account.", crypto });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ status: "ERROR", response: "Internal Server Error" });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(403).json({ status: "ERROR", response: "Account not registered" });
            }

            if (!user.active) {
                return res.status(403).json({ status: "ERROR", response: "Account is not active" })
            }

            const isPasswordCorrect = await verify(user.password, password);
            if (!isPasswordCorrect) {
                return res.status(401).json({ status: "ERROR", response: "Password is incorrect" })
            }

            res.clearCookie(COOKIE_NAME, {
                secure: true,
                sameSite: "none",
                httpOnly: true,
                domain: hostUrl,
                signed: true,
                path: "/",
            });

            const token = createToken(user._id.toString(), user.email, user.fullname, "7d");
            const expires = new Date();
            expires.setDate(expires.getDate() + 7);

            res.cookie(COOKIE_NAME, token, {
                secure: true,
                sameSite: "none",
                httpOnly: true,
                path: "/",
                domain: hostUrl,
                expires,
                signed: true,
            });

            const { fullname, image } = user;

            return res
                .status(200)
                .json({ status: "OK", response: { fullname, email, image } });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ status: "ERROR", response: "Internal Server Error" });
        }
    }


    async logout(req, res) {
        try {
            const user = await User.findById(res.locals.jwtData.id);
            if (!user) {
                return res.status(401).send({ response: "Account not registered OR Token malfunctioned" });
            }

            if (user._id.toString() !== res.locals.jwtData.id) {
                return res.status(403).send("Permissions didn't match");
            }

            res.clearCookie(COOKIE_NAME, {
                secure: true,
                sameSite: "none",
                httpOnly: true,
                domain: hostUrl,
                signed: true,
                path: "/",
            });


            return res
                .status(200)
                .json({ status: "OK" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ status: "ERROR", response: "Internal Server Error" });
        }
    }

    async activateAccount(req, res) {
        let otp = req.params.otp;
        let crypto = req.params.crypto;
        const mail = req.query.mail;

        if (!otp) return res.status(400).json({ status: "OTP is required" });
        if (!crypto) return res.status(400).json({ status: "crypto is required" });


        const credential = JSON.parse(await redisDB.get(`otp_${crypto}`));
        console.log(crypto, credential, otp);
        
        if (!credential || credential['otp'] !== otp) {
            return res.status(401).json({ status: "ERROR", response: "Invalid or expired token" });
        }
        delete credential['otp'];


        const user = new User(credential);

        user.save()

        if (!user) {
            return res.status(500).json({ status: "ERROR", response: "User not found" });
        }


        res.clearCookie(COOKIE_NAME, {
            secure: true,
            sameSite: "none",
            httpOnly: true,
            domain: hostUrl,
            signed: true,
            path: "/",
        });

        const token = createToken(user._id.toString(), user.email, user.fullname, "7d");
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);

        res.cookie(COOKIE_NAME, token, {
            secure: true,
            sameSite: "none",
            httpOnly: true,
            path: "/",
            domain: hostUrl,
            expires,
            signed: true,
        });

        await redisDB.del(`otp_${crypto}`);
        delete credential['password'];

        if (mail) res.redirect('/');
        return res
            .status(200)
            .json({ status: "OK", user: credential });
    }


    async forgotPassword(req, res) {
        const email = req.body.email;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ status: "ERROR", response: "User not registered" });
        }

        await redisDB.set(`reset_${crypto}`, email, 60 * 60);

        try {
            await mail.sendResetPasswordEmail(user, crypto);
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: "ERROR", response: "Failed to send password link" });
        }

        res.json({ status: "OK", response: "We've sent a password reset link to your email. Please check your inbox to reset your password." });
    }


    async resetPassword(req, res) {
        const { password } = req.body;
        const crypto = req.params.crypto;
        const email = await redisDB.get(`reset_${crypto}`);
        if (!email) {
            return res.status(401).json({ status: "ERROR", response: "Invalid or expired token" });
        }

        const hashedPassword = await hash(password);
        await User.findOneAndUpdate(
            { email },
            { $set: { password: hashedPassword } },
            { new: true }
        );

        await redisDB.del(`reset_${crypto}`);
        res.status(201).json({ status: "OK", response: "Password reset successfully" })
    }
}

const authContoller = new AuthenticationController();

export default authContoller;