import React, { useState } from "react";
import { Button } from "./components/Button";
import { Card } from "./components/Card";

export default function App() {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		phone: "",
		referral_code: "",
	});

	function handleChange(e) {
		const { name, value } = e.target;
		setFormData((s) => ({ ...s, [name]: value }));
	}

	function handleSubmit(e) {
		e.preventDefault();
		// for now just log the data
		// replace with real submit logic as needed
		// eslint-disable-next-line no-console
		console.log("Form submitted", formData);
		setFormData({ name: "", email: "", phone: "", referral_code: "" });
	}

	return (
		<div className="min-h-screen bg-white text-gray-900">
			<header className="p-6 bg-white shadow-sm">
				<nav className="container mx-auto flex items-center justify-between">
					<div className="flex items-center space-x-3">
						<img src="/images/logo.png" alt="Logo" className="w-10 h-10" />
						<span className="font-bold text-xl">Our Business</span>
					</div>
					<div>
						<Button className="bg-blue-600 hover:bg-blue-700 text-white">Get Started</Button>
					</div>
				</nav>
			</header>

			<section className="flex flex-col md:flex-row items-center justify-center bg-gray-100 p-12">
				<div className="md:w-1/2 space-y-6">
					<h1 className="text-4xl font-bold">Welcome to Our Business</h1>
					<p className="text-lg text-gray-600">
						We provide top-notch services to help you achieve success. Explore our offerings and
						connect with us today.
					</p>
				</div>
				<div className="md:w-1/2">
					<img
						src="/images/logo.jpg"
						alt="Hero"
						className="rounded-2xl shadow-lg max-w-full h-auto"
					/>
				</div>
			</section>

			<section id="services" className="p-12 bg-white">
				<h2 className="text-3xl font-bold text-center mb-8">Our Services</h2>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<Card>
						<div className="p-6 text-center">
							<h3 className="font-semibold text-xl mb-2">Service One</h3>
							<p className="text-gray-600">Description of service one goes here.</p>
						</div>
					</Card>
					<Card>
						<div className="p-6 text-center">
							<h3 className="font-semibold text-xl mb-2">Service Two</h3>
							<p className="text-gray-600">Description of service two goes here.</p>
						</div>
					</Card>
					<Card>
						<div className="p-6 text-center">
							<h3 className="font-semibold text-xl mb-2">Service Three</h3>
							<p className="text-gray-600">Description of service three goes here.</p>
						</div>
					</Card>
				</div>
			</section>

			<section id="contact" className="p-12 bg-gray-100">
				<h2 className="text-3xl font-bold text-center mb-8">Contact Us</h2>
				<form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-4">
					<input
						type="text"
						name="name"
						placeholder="Your Name"
						value={formData.name}
						onChange={handleChange}
						className="w-full border p-3 rounded-lg"
					/>
					<input
						type="email"
						name="email"
						placeholder="Your Email"
						value={formData.email}
						onChange={handleChange}
						className="w-full border p-3 rounded-lg"
					/>
					<input
						type="tel"
						name="phone"
						placeholder="Your Phone"
						value={formData.phone}
						onChange={handleChange}
						className="w-full border p-3 rounded-lg"
					/>
					<input
						type="text"
						name="referral_code"
						placeholder="Referral Code"
						value={formData.referral_code}
						onChange={handleChange}
						className="w-full border p-3 rounded-lg"
					/>
					<Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
						Submit
					</Button>
				</form>
			</section>

			<footer className="p-6 bg-blue-600 text-white text-center">
				<p>© {new Date().getFullYear()} Our Business. All rights reserved.</p>
			</footer>
		</div>
	);
}