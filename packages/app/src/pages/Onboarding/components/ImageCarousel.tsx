import { useState } from 'react';
import { Carousel, IconButton, Box, Text, HStack, Flex } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Card } from '@/components/Card';

interface ICarouselSlide {
	image?: string;
	title: string;
	description: string;
}

interface IImageCarouselProps {
	slides: ICarouselSlide[];
}

export function ImageCarousel({ slides }: IImageCarouselProps) {
	const [currentIndex, setCurrentIndex] = useState(0);

	const handleSlideChange = (details: { index: number }) => {
		setCurrentIndex(details.index);
	};

	const currentSlide = slides[currentIndex];

	return (
		<Box>
			<Carousel.Root slideCount={slides.length} maxW="560px" mx="auto" onChange={handleSlideChange}>
				<Carousel.ItemGroup>
					{slides.map((slide, index) => (
						<Carousel.Item key={index} index={index}>
							<Card
								bg={slide.image ? 'transparent' : 'rgba(255, 255, 255, 0.03)'}
								borderColor={slide.image ? 'transparent' : 'rgba(255, 255, 255, 0.06)'}
								p="0"
								overflow="hidden"
							>
								<Box
									w="100%"
									h="280px"
									display="flex"
									alignItems="center"
									justifyContent="center"
									bgImage={slide.image ? `url(${slide.image})` : undefined}
									bgSize="cover"
									bgPosition="center"
									bgColor={!slide.image ? 'rgba(255, 255, 255, 0.02)' : undefined}
								>
									{!slide.image && (
										<Flex direction="column" align="center" gap="2" color="rgba(255, 255, 255, 0.15)">
											<ImageIcon size={32} />
											<Text fontSize="12px">Screenshot placeholder</Text>
										</Flex>
									)}
								</Box>
							</Card>
						</Carousel.Item>
					))}
				</Carousel.ItemGroup>

				<Carousel.Control justifyContent="center" gap="4" mt="3">
					<Carousel.PrevTrigger asChild>
						<IconButton size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: 'rgba(255, 255, 255, 0.7)' }}>
							<ChevronLeft size={16} />
						</IconButton>
					</Carousel.PrevTrigger>

					<Carousel.Indicators />

					<Carousel.NextTrigger asChild>
						<IconButton size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: 'rgba(255, 255, 255, 0.7)' }}>
							<ChevronRight size={16} />
						</IconButton>
					</Carousel.NextTrigger>
				</Carousel.Control>
			</Carousel.Root>

			<Box textAlign="center" mt="5" maxW="480px" mx="auto" px="4">
				<Text fontSize="16px" fontWeight="600" color="#e4e4e7" mb="2">
					{currentSlide.title}
				</Text>
				<Text fontSize="13px" color="rgba(255, 255, 255, 0.45)" lineHeight="1.6">
					{currentSlide.description}
				</Text>
			</Box>
		</Box>
	);
}
